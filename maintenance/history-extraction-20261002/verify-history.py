#!/usr/bin/env python3
"""Independent byte-preservation, commit-metadata and workflow validation."""
import collections
import json
from pathlib import Path
import re
import subprocess
import sys
import yaml

repo=Path(sys.argv[1]); evidence=Path(sys.argv[2])
def git(*args):return subprocess.check_output(['git','-C',str(repo),*args])
def tree(sha):
    entries={}
    for row in git('ls-tree','-rz',sha).split(b'\0'):
        if row:
            meta,p=row.split(b'\t');entries[p.decode()]=meta.decode()
    return entries
def blob(meta):return git('cat-file','blob',meta.split()[-1])
def metadata(sha):
    headers,message=git('cat-file','commit',sha).split(b'\n\n',1)
    return ([x for x in headers.splitlines() if x.startswith((b'author ',b'committer ',b'encoding '))],message)
def exclusive(p):
    return p.startswith(('packages/limina/','skills/limina/','.agents/docs/limina','.agents/docs/zh/limina')) or p in ('docs/en/limina.md','docs/zh/limina.md')
semantic_paths={'pnpm-lock.yaml','pnpm-workspace.yaml','package.json','limina.config.mjs','limina.config.ts','limina.config.mts','scripts/release/shared.ts','README.md','README.zh-CN.md','.github/CONTRIBUTING.md','.github/CONTRIBUTING.zh-CN.md','docs/en/guide/skills.md','docs/zh/guide/skills.md'}
rows=json.loads((evidence/'commit-map.json').read_text());checked=0;metadata_checked=0;ci_seen=set();file_decisions=[]
for row in rows:
    old=tree(row['old']);new=tree(row['new'])
    for p,meta in old.items():
        if exclusive(p):
            assert p not in new,(row['old'],p,'exclusive content remains');continue
        assert p in new,(row['old'],p,'business file lost')
        if meta==new[p]:checked+=1;continue
        allowed=p in semantic_paths or p.endswith('/package.json') or p.endswith('/project.json') or p.startswith('.github/workflows/')
        assert allowed,(row['old'],p,'unexpected business blob changed')
        if p.endswith('package.json'):
            a=json.loads(blob(meta));b=json.loads(blob(new[p]))
            for section in ('dependencies','devDependencies','optionalDependencies'):
                if a.get(section,{}).get('limina','').startswith(('workspace:','link:','file:')):del a[section]['limina']
            if p=='package.json' and 'test:smoke' in a.get('scripts',{}):
                a['scripts']['test:smoke']=re.sub(r'\s*&&\s*pnpm run _run smoke limina\b','',a['scripts']['test:smoke'])
            assert a==b,(row['old'],p,'non-Limina manifest change')
        if p=='pnpm-lock.yaml':
            a=yaml.safe_load(blob(meta));b=yaml.safe_load(blob(new[p]))
            for importer,value in a.get('importers',{}).items():
                if exclusive(importer+'/'):continue
                for section in ('dependencies','devDependencies','optionalDependencies'):
                    d=value.get(section,{}).get('limina')
                    if d and d.get('specifier','').startswith(('workspace:','link:','file:')):del value[section]['limina']
                assert value==b['importers'][importer],(row['old'],importer,'retained lock importer changed')
        file_decisions.append({'commit':row['old'],'path':p,'old_blob':meta.split()[-1],'new_blob':new[p].split()[-1],'decision':'remove-only-Limina-owned-entries'})
    assert not any(exclusive(p) for p in new),(row['new'],'exclusive content reintroduced')
    if row['action']=='retain':
        assert metadata(row['old'])==metadata(row['new']),(row['old'],'commit metadata/message changed')
        assert b'\ngpgsig ' not in git('cat-file','commit',row['new']),(row['new'],'signature claimed')
        metadata_checked+=1
    ci=new.get('.github/workflows/ci.yml')
    if ci and ci not in ci_seen:
        ci_seen.add(ci);m=yaml.safe_load(blob(ci));jobs=m.get('jobs',{})
        for name,job in jobs.items():
            assert not name.startswith('limina-'),name
            needs=job.get('needs',[]);needs=[needs] if isinstance(needs,str) else needs
            assert all(n in jobs for n in needs),(row['new'],name,needs,list(jobs))
        assert not re.search(r'run:.*(?:nx run limina:|packages/limina/|limina-smoke:)',blob(ci).decode()),row['new']
summary={'status':'pass','original_commits_checked':len(rows),'retained_commit_metadata_checked':metadata_checked,'unchanged_business_blob_observations':checked,'ci_versions_checked':len(ci_seen),'semantic_file_decisions':len(file_decisions),'signed_originals_archived':sum(r['signed_original'] for r in rows)}
(evidence/'history-verification.json').write_text(json.dumps(summary,indent=2)+'\n')
(evidence/'semantic-file-decisions.json').write_text(json.dumps(file_decisions,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(summary,indent=2))
