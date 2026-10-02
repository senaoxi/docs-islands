#!/usr/bin/env python3
"""Rebuild only a new local ref; never rewrite original or remote refs.

Projection is a file-semantic operation. Original commits and refs are archived.
The final registry lockfile is regenerated separately by pnpm, not this script.
"""
import collections
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import yaml

REPO = Path(sys.argv[1])
EVIDENCE = Path(sys.argv[2])
BASE = sys.argv[3] if len(sys.argv) > 3 else '99e797c7c8ab6da76f98d1123ec289878cd1b119'
OUT_REF = sys.argv[4] if len(sys.argv) > 4 else 'refs/heads/codex/history-projection-20261002-v3'
LIMINA_FIXTURE_ADVISORIES = {
    'GHSA-8266-84wp-wv5c', 'GHSA-crpf-4hrx-3jrp', 'GHSA-m56q-vw4c-c2cp',
    'GHSA-f7gr-6p89-r883', 'GHSA-phwv-c562-gvmh', 'GHSA-rcqx-6q8c-2c42',
    'GHSA-pr6f-5x2q-rwfp', 'GHSA-4g3v-8h47-v7g6', 'GHSA-8mv7-9c27-98vc',
    'GHSA-f48w-9m4c-m7f5', 'GHSA-7pw4-f3q4-r2p2', 'GHSA-26w7-cxv4-gfx2',
    'GHSA-376h-93r7-7g6f',
}

def git(*args, data=None, env=None):
    return subprocess.check_output(['git', '-C', str(REPO), *args], input=data, env=env)

def exclusive(path):
    # The shared landing-page logo/marketing card, shared utils and ESLint remain.
    return path.startswith(('packages/limina/', 'skills/limina/',
                            '.agents/docs/limina', '.agents/docs/zh/limina')) or path in (
        'docs/en/limina.md', 'docs/zh/limina.md')

blob_cache = {}
yaml_cache = {}
projected_lock_cache = {}
def blob(sha):
    if sha not in blob_cache:
        blob_cache[sha] = git('cat-file', 'blob', sha)
    return blob_cache[sha]

def hash_blob(data):
    sha = git('hash-object', '-w', '--stdin', data=data).decode().strip()
    blob_cache[sha] = data
    return sha

def tree(sha):
    result = {}
    for row in git('ls-tree', '-rz', sha).split(b'\0'):
        if row:
            meta, path = row.split(b'\t', 1)
            mode, kind, obj = meta.decode().split()
            assert kind == 'blob', (sha, path, kind)
            result[path.decode()] = (mode, obj)
    return result

def json_bytes(value):
    return (json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode()

def yaml_bytes(value):
    return yaml.safe_dump(value, sort_keys=False, allow_unicode=True, width=1000).encode()

def yaml_value(oid):
    if oid not in yaml_cache:
        yaml_cache[oid] = yaml.safe_load(blob(oid))
    # Each snapshot gets independent mutable data.
    import copy
    return copy.deepcopy(yaml_cache[oid])

def strip_limina_package_entry(text):
    # Objects with a packages/limina outDir or release key are exclusively owned.
    patterns = [r"\n[ \t]*\{\n[ \t]*name: ['\"]limina['\"],",
                r"\n[ \t]*\{\n[ \t]*key: ['\"]limina['\"],"]
    for pattern in patterns:
        while (match := re.search(pattern, text)):
            begin = text.index('{', match.start())
            depth = 0
            quote = None
            escape = False
            for end in range(begin, len(text)):
                char = text[end]
                if quote:
                    if escape: escape = False
                    elif char == '\\': escape = True
                    elif char == quote: quote = None
                elif char in "'\"`": quote = char
                elif char == '{': depth += 1
                elif char == '}':
                    depth -= 1
                    if depth == 0: break
            end += 1
            if text[end:end+1] == ',': end += 1
            text = text[:match.start()] + text[end:]
    return text

def strip_config(text):
    text = strip_limina_package_entry(text)
    return ''.join(line for line in text.splitlines(keepends=True)
                   if not re.fullmatch(r"\s*['\"]packages/limina[^'\"]*['\"],?\s*\n?", line))

def strip_ci(text):
    # Preserve original YAML syntax (notably 'on') and all unrelated job bodies.
    job = re.compile(r'^  ([A-Za-z0-9_-]+):\s*$', re.M)
    matches = list(job.finditer(text))
    for i in range(len(matches)-1, -1, -1):
        m = matches[i]
        if m.group(1).startswith('limina-'):
            end = matches[i+1].start() if i+1 < len(matches) else len(text)
            text = text[:m.start()] + text[end:]
    lines = text.splitlines(keepends=True)
    starts = [i for i,l in enumerate(lines) if re.match(r'      - (?:name:|uses:)', l)]
    for i in range(len(starts)-1, -1, -1):
        begin = starts[i]; end = starts[i+1] if i+1 < len(starts) else len(lines)
        # Don't consume a following job; steps are bounded by indentation.
        for j in range(begin+1, end):
            if re.match(r'  [A-Za-z0-9_-]+:', lines[j]): end=j; break
        block=''.join(lines[begin:end])
        if re.search(r'run:.*(?:nx run limina:|packages/limina/|limina-smoke:)', block):
            del lines[begin:end]
    text=''.join(lines)
    text=re.sub(r'^\s+limina-[A-Za-z0-9_-]+,?\s*\n', '', text, flags=re.M)
    text=re.sub(r'^\s+- [\'\"]packages/limina/\*\*[\'\"].*\n', '', text, flags=re.M)
    text=re.sub(r'^\s+# (?:Limina release gates|repositories, smoke metadata).*\n', '', text, flags=re.M)
    return text

def remove_project_dependency(value):
    if isinstance(value, dict):
        for key, v in list(value.items()):
            value[key]=remove_project_dependency(v)
    elif isinstance(value, list):
        value=[remove_project_dependency(v) for v in value
               if v not in ('limina', '@docs-islands/limina-docs', '@docs-islands/limina-smoke')]
        value=[v for v in value if not isinstance(v,dict) or v.get('projects') != []]
    return value

def strip_release_workflow(text):
    text=re.sub(r'^\s*- [\'\"]limina/v\*[\'\"]\s*\n', '', text, flags=re.M)
    text=re.sub(r'^\s*- limina\s*\n', '', text, flags=re.M)
    text=re.sub(r'^\s*limina/v\*\).*?;;\n', '', text, flags=re.M|re.S)
    return text.replace('(logaria|limina|vitepress)', '(logaria|vitepress)')

def strip_skill_guide(text):
    text=re.sub(r'\n(?:Install the limina skill:|安装 Limina skill：)\n\n```bash\n.*?```\n', '\n', text, flags=re.S)
    text=re.sub(r'^.*--skill limina.*\n', '', text, flags=re.M)
    text=re.sub(r'^\|\s*`limina`\s*\|.*\n', '', text, flags=re.M)
    text=re.sub(r'^npx skills update limina\s*\n', '', text, flags=re.M)
    text=text.replace('`limina`, `logaria`, and ', '`logaria` and ').replace('`limina`、`logaria` 和 ', '`logaria` 和 ')
    return text.replace('Limina configs, ', '').replace('Limina 配置、', '')

def project(original):
    projected={p:v for p,v in original.items() if not exclusive(p)}
    # All untouched shared/business blobs are carried through byte-for-byte.
    manifests={}
    catalog_usage=collections.defaultdict(set)
    limina_catalog_usage=collections.defaultdict(set)
    for p,(_,oid) in original.items():
        if not p.endswith('package.json'): continue
        try: m=json.loads(blob(oid))
        except (ValueError, UnicodeDecodeError): continue
        owner=limina_catalog_usage if exclusive(p) else catalog_usage
        for section in ('dependencies','devDependencies','optionalDependencies','peerDependencies'):
            for name, version in m.get(section,{}).items():
                if version.startswith('catalog:'): owner[version[8:] or 'default'].add(name)
        if not exclusive(p): manifests[p]=m
    for p,m in manifests.items():
        before=json_bytes(m)
        for section in ('dependencies','devDependencies','optionalDependencies'):
            dep=m.get(section,{}).get('limina')
            if dep and (dep.startswith(('workspace:','link:','file:'))):
                del m[section]['limina']
        if p=='package.json' and 'test:smoke' in m.get('scripts',{}):
            m['scripts']['test:smoke']=re.sub(r'\s*&&\s*pnpm run _run smoke limina\b', '', m['scripts']['test:smoke'])
        if json_bytes(m)!=before: projected[p]=(projected[p][0],hash_blob(json_bytes(m)))
    # Drop catalog versions only when Limina owns them and no retained manifest uses them.
    removed_catalogs={cat: names-catalog_usage[cat] for cat,names in limina_catalog_usage.items()}
    for p in ('pnpm-workspace.yaml',):
        if p not in projected: continue
        value=yaml_value(projected[p][1])
        before=json.dumps(value,sort_keys=True)
        for cat, names in removed_catalogs.items():
            target=value.get('catalog',{}) if cat=='default' else value.get('catalogs',{}).get(cat,{})
            for name in names: target.pop(name,None)
        # Dev-only compatibility fixtures are removed along with their package.
        value.get('overrides',{}).pop('astro@7.0.0>sharp',None)
        ignores=value.get('auditConfig',{}).get('ignoreGhsas')
        if ignores:
            value['auditConfig']['ignoreGhsas']=[x for x in ignores if x not in LIMINA_FIXTURE_ADVISORIES]
        if 'trustPolicyExclude' in value:
            value['trustPolicyExclude']=[x for x in value['trustPolicyExclude'] if x != 'chokidar@4.0.3']
        if json.dumps(value,sort_keys=True)!=before: projected[p]=(projected[p][0],hash_blob(yaml_bytes(value)))
    if 'pnpm-lock.yaml' in projected:
        lock_oid=projected['pnpm-lock.yaml'][1]
        lock=yaml_value(lock_oid)
        before=json.dumps(lock,sort_keys=True)
        importers=lock.get('importers',{})
        import copy
        original_importers=copy.deepcopy(importers)
        for p in list(importers):
            if exclusive(p+'/'): del importers[p]; continue
            for section in ('dependencies','devDependencies','optionalDependencies'):
                dep=importers[p].get(section,{}).get('limina')
                if dep and (dep.get('specifier','').startswith(('workspace:','link:','file:'))):
                    del importers[p][section]['limina']
        for cat,names in removed_catalogs.items():
            for name in names: lock.get('catalogs',{}).get(cat,{}).pop(name,None)
        lock.get('overrides',{}).pop('astro@7.0.0>sharp',None)
        snapshots=lock.get('snapshots',lock.get('packages',{}))
        packages=lock.get('packages',{})
        def resolve(name,version):
            if isinstance(version,dict): version=version.get('version','')
            if not isinstance(version,str) or version.startswith(('link:','workspace:','file:')): return None
            version=version.removeprefix('npm:')
            choices=(version,name+'@'+version,'/'+name+'@'+version,'/'+name+'/'+version)
            return next((v for v in choices if v in snapshots),None)
        def reachable(roots):
            queue=[]
            for importer in roots.values():
                for section in ('dependencies','devDependencies','optionalDependencies'):
                    queue.extend(resolve(name,dep) for name,dep in importer.get(section,{}).items())
            seen=set()
            while queue:
                key=queue.pop()
                if not key or key in seen: continue
                seen.add(key)
                for section in ('dependencies','optionalDependencies'):
                    queue.extend(resolve(name,version) for name,version in snapshots[key].get(section,{}).items())
            return seen
        # Preserve unrelated pre-existing orphan records; only remove nodes
        # whose reachability was exclusively through the extracted package.
        removed=reachable(original_importers)-reachable(importers)
        if importers:
            if 'snapshots' in lock:
                lock['snapshots']={k:v for k,v in snapshots.items() if k not in removed}
                package_keys={k.split('(')[0] for k in lock['snapshots']}
                removed_keys={k.split('(')[0] for k in removed}-package_keys
                lock['packages']={k:v for k,v in packages.items() if k not in removed_keys}
            else: lock['packages']={k:v for k,v in packages.items() if k not in removed}
        if json.dumps(lock,sort_keys=True)!=before:
            projected['pnpm-lock.yaml']=(projected['pnpm-lock.yaml'][0],hash_blob(yaml_bytes(lock)))
    for p, (mode,oid) in list(projected.items()):
        if p in ('limina.config.mjs','limina.config.ts','limina.config.mts'):
            data=strip_config(blob(oid).decode()).encode()
        elif p=='.github/workflows/ci.yml': data=strip_ci(blob(oid).decode()).encode()
        elif p.startswith('.github/workflows/') and p.endswith(('.yml','.yaml')):
            data=strip_release_workflow(blob(oid).decode()).encode()
            if p=='.github/workflows/dependency-review.yml':
                data=re.sub(r'^.*# @astrojs/check pulls.*\n(?:.*#.*\n){2}.*allow-dependencies-licenses:.*\n', '', data.decode(),flags=re.M).encode()
        elif p in ('README.md','README.zh-CN.md'):
            data=re.sub(r'^\|\s*\[limina\].*\n','',blob(oid).decode(),flags=re.M).encode()
        elif p in ('.github/CONTRIBUTING.md','.github/CONTRIBUTING.zh-CN.md'):
            data=re.sub(r'^.*(?:pnpm (?:changelog|release) --package limina|^- `limina` ->|^- `limina/v<version>`).*\n','',blob(oid).decode(),flags=re.M).encode()
        elif p in ('docs/en/guide/skills.md','docs/zh/guide/skills.md'):
            data=strip_skill_guide(blob(oid).decode()).encode()
        elif p=='scripts/release/shared.ts':
            data=strip_limina_package_entry(blob(oid).decode()).replace("'logaria' | 'limina' | 'vitepress'", "'logaria' | 'vitepress'").encode()
        elif p.endswith('/project.json'):
            try:
                m=json.loads(blob(oid));n=remove_project_dependency(json.loads(blob(oid)))
                data=json_bytes(n) if m!=n else blob(oid)
            except ValueError: continue
        else: continue
        if data!=blob(oid): projected[p]=(mode,hash_blob(data))
    return projected

def write_tree(files):
    index_env={**os.environ,'GIT_INDEX_FILE':str(EVIDENCE/'projection.index')}
    git('read-tree','--empty',env=index_env)
    records=b''.join(f'{mode} {oid}\t{p}\0'.encode() for p,(mode,oid) in sorted(files.items()))
    git('update-index','-z','--index-info',data=records,env=index_env)
    return git('write-tree',env=index_env).decode().strip()

def commit(tree_sha,parent,old_sha):
    raw=git('cat-file','commit',old_sha)
    headers,message=raw.split(b'\n\n',1)
    keep=[];skip=False
    for line in headers.splitlines():
        if line.startswith(b' '):
            if not skip:keep.append(line)
            continue
        key=line.split(b' ',1)[0]
        skip=key not in (b'author',b'committer',b'encoding')
        if not skip:keep.append(line)
    out=f'tree {tree_sha}\n'.encode()
    if parent:out+=f'parent {parent}\n'.encode()
    out+=b'\n'.join(keep)+b'\n\n'+message
    return git('hash-object','-t','commit','-w','--stdin',data=out).decode().strip()

def run():
    commits=git('rev-list','--reverse',BASE).decode().splitlines()
    assert not git('rev-list','--min-parents=2',BASE).strip(), 'Explicit merge policy required'
    assert not subprocess.run(['git','-C',str(REPO),'show-ref','--verify','--quiet',OUT_REF]).returncode==0, 'Output ref already exists'
    records=[];previous={};new_parent=None;old_parent=None;last_tree=None
    for i,old in enumerate(commits):
        original=tree(old); projected=project(original)
        sha=write_tree(projected)
        dropped=sha==last_tree
        new=new_parent if dropped else commit(sha,new_parent,old)
        changes=[p for p in sorted(set(previous)|set(projected)) if previous.get(p)!=projected.get(p)]
        original_changes=git('diff-tree','--no-commit-id','--root','--name-only','-r',old).decode().splitlines()
        e=[p for p in original_changes if exclusive(p)]
        path_class='pure-limina' if e and len(e)==len(original_changes) else 'mixed' if e else 'other'
        records.append({'old':old,'new':new,'action':'drop-projected-empty' if dropped else 'retain',
                        'path_class':path_class,'subject':git('show','-s','--format=%s',old).decode().strip(),
                        'removed_exclusive_paths':e,'retained_projected_changes':changes,
                        'original_tree':git('rev-parse',old+'^{tree}').decode().strip(),'projected_tree':sha,
                        'signed_original':b'\ngpgsig ' in git('cat-file','commit',old)})
        previous=projected;new_parent=new;old_parent=old;last_tree=sha
        if i%40==0:print(f'{i+1}/{len(commits)} {old[:8]} -> {new[:8]}',flush=True)
    git('update-ref',OUT_REF,new_parent,'0'*40)
    (EVIDENCE/'commit-map.json').write_text(json.dumps(records,ensure_ascii=False,indent=2)+'\n')
    (EVIDENCE/'commit-map.tsv').write_text('old\tnew\taction\tpath_class\tsubject\n'+''.join(
        '\t'.join(r[k] for k in ('old','new','action','path_class','subject'))+'\n' for r in records))
    summary={'original':BASE,'projection':new_parent,'original_count':len(commits),
             'retained':sum(r['action']=='retain' for r in records),
             'dropped':sum(r['action']!='retain' for r in records),
             'path_classes':dict(collections.Counter(r['path_class'] for r in records)),
             'dropped_classes':dict(collections.Counter(r['path_class'] for r in records if r['action']!='retain'))}
    (EVIDENCE/'projection-summary.json').write_text(json.dumps(summary,indent=2)+'\n')
    print(json.dumps(summary,indent=2),flush=True)

if __name__=='__main__':run()
