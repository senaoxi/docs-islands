# CLAUDE.md

Cross-framework Islands Architecture for documentation sites. pnpm monorepo.

## Structure

```bash
packages/
  core/           # Core runtime
  vitepress/      # VitePress integration
  eslint-config/  # Shared ESLint config
  plugins/        # Vite/Rollup plugins
docs/             # Documentation site
utils/            # Shared utilities
```

## Commands

```bash
pnpm build              # Build all packages
pnpm test               # Run unit + e2e tests
pnpm test:unit          # Unit tests only
pnpm test:e2e           # E2E tests only
pnpm lint               # ESLint + Prettier
pnpm typecheck          # TypeScript type checking
pnpm docs:dev [pkg]     # Dev server for docs (default: monorepo)
```

## Conventions

- Commit messages: conventional commits (`feat`, `fix`, `refactor`, etc.) with scope.
- Package manager: pnpm (enforced). Node.js ^22.18.0 || >=24.11.0.
- Module format: ESM (`"type": "module"`).

## Skills

- **comment-optimization** - Optimize code comments for grammar, style, and clarity. See `.claude/skills/comment-optimization/SKILL.md`.
