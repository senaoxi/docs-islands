<!-- markdownlint-disable MD014 MD034 -->

# Docs Islands Contributing Guide

Hi! We're really excited that you are interested in contributing to Docs Islands. Before submitting your contribution, please make sure to take a moment and read through the following guidelines:

- [Types of Contributions](#types-of-contributions)
- [How to Report Issues](#how-to-report-issues)
- [Pull Request Guidelines](#pull-request-guidelines)
- [Development Setup](#development-setup)

## Types of Contributions

We welcome many different types of contributions:

### Bug Reports

Help us identify and fix bugs by reporting them with detailed reproduction steps.

### Feature Requests

Suggest new features or improvements to existing functionality.

### Documentation

Improve our documentation, fix typos, or add examples.

### Code Contributions

Fix bugs, implement new features, or improve performance.

### Translations

Help make the project accessible to more people by contributing translations.

### Testing

Write tests, improve test coverage, or help with manual testing.

## How to Report Issues

When reporting bugs or requesting features, please:

### For Bug Reports

1. **Search existing issues** to avoid duplicates
2. **Use a clear title** that describes the problem
3. **Provide detailed reproduction steps**:

   - What you did
   - What you expected to happen
   - What actually happened

4. **Include system information**:

   - Operating system and version
   - Node.js version
   - Package version

5. **Add relevant code samples** or screenshots if applicable

### For Feature Requests

1. **Search existing issues** to avoid duplicates
2. **Describe the problem** you're trying to solve
3. **Explain your proposed solution** and why it would be useful
4. **Consider alternatives** and mention any you've considered
5. **Provide examples** of how the feature would be used

## Pull Request Guidelines

- Checkout a topic branch from the `main` branch and merge back against that branch.

- If adding a new feature:

  - Add accompanying test case.
  - Provide a convincing reason to add this feature. Ideally, you should open a suggestion issue first and have it approved before working on it.

- If fixing a bug:

  - If you are resolving a special issue, add `(fix #xxxx[,#xxxx])` (#xxxx is the issue id) in your PR title for a better release log (e.g. `fix: update entities encoding/decoding (fix #3899)`).
  - Provide a detailed description of the bug in the PR. Live demo preferred.
  - Add appropriate test coverage if applicable.

- If it's a chore:

  - For typos and comment changes, try to combine multiple of them into a single PR.
  - **Note that we discourage contributors from submitting code refactors that are largely stylistic.** Code refactors are only accepted if it improves performance, or objectively improves code quality (e.g. makes a related bug fix or feature implementation easier, and it is as a separate PR to improve git history).
    - The reason is that code readability is subjective. The maintainers of this project have chosen to write the code in its current style based on our preferences, and we do not want to spend time explaining our stylistic preferences. Contributors should just respect the established conventions when contributing code. Another aspect of it is that large scale stylistic changes result in massive diffs that touch multiple files, adding noise to the git history and makes tracing behavior changes across commits more cumbersome.

- It's OK to have multiple small commits as you work on the PR - GitHub can automatically squash them before merging.

- This is a monorepo project. Before submitting, make sure to run the following commands in the root directory:

  ```sh
  pnpm format
  pnpm lint
  pnpm check
  pnpm test
  ```

- No need to worry about code style as long as you have installed the dev dependencies. Modified files are automatically formatted with Prettier on commit and checked by ESLint.

- PR title must follow the [commit message convention](https://github.com/XiSenao/docs-islands/blob/main/.github/commit-convention.md) so that changelogs can be automatically generated.

### DevDependencies Sorting Order

To enhance readability and maintainability, `devDependencies` in `package.json` follows a "group-based ordering + alphabetical order within groups" strategy.

Group ordering (top to bottom):

1. **Code Quality** - Linting, formatting, and git hooks
2. **TypeScript Tooling** - TypeScript compiler and related tools
3. **Type Definitions** - @types/\* packages for type declarations
4. **Build & Bundle** - Build tools, bundlers, and development utilities
5. **Testing** - Testing frameworks, runners, and utilities
6. **UI Framework (Dev)** - Framework-specific development dependencies
7. **Runtime Helpers** - Utility libraries supporting runtime operations
8. **Babel Tooling** - Code transformation and compatibility tools
9. **Internal Workspace** - Local workspace package links

Rules:

- Dependencies within each group are sorted alphabetically by package name.
- Avoid cross-group duplication; follow existing group semantics when adding new dependencies.
- This ordering follows the development workflow: from code quality foundations to specific framework implementations.

## Development Setup

You will need [Node.js](https://nodejs.org) v20.19.0+ or v22.12.0+ and [pnpm](https://pnpm.io) 10.17.0+.

Clone the repository:

```sh
git clone git@github.com:XiSenao/docs-islands.git
```

Enter the repository directory:

```sh
cd docs-islands
```

Install the project dependencies:

```sh
pnpm install
```

### Development with Documentation

The easiest way to test your changes is to run the documentation site locally.

This repository provides an optimized development experience where you can develop the `Docs Islands` source code while setting breakpoints through a JavaScript Debug Terminal and previewing changes live in the documentation, without needing to manually restart the service.

1. Prepare the documentation to use the local package:

   ```bash
   pnpm install
   pnpm build          # one-time build to generate dist/* files for development runtime build
   pnpm docs:link:dev
   ```

2. Start the documentation in a JavaScript Debug Terminal:

   - **In VS Code**: Terminal → New `JavaScript Debug Terminal`
   - Start the documentation for a specific project with

   ```bash
   pnpm docs:dev
   ```

   This enables the default `@docs-islands/monorepo-docs` documentation project. You can start other projects by specifying the project name:

   For example:

   ```bash
   pnpm docs:dev vitepress
   ```

   This enables the `@docs-islands/vitepress-docs` documentation project.

   You can place `debugger;` statements in the library source code (e.g., `packages/vitepress/src/node/**`, `packages/vitepress/src/client/**`), and when the code path runs, execution will pause in the attached debugger.

   After executing the above command, visit http://localhost:5173/docs-islands/vitepress/ and try modifying the source code. You'll get live updates as you develop.

3. Edit, save, continue:

   - For **client** and **server** source code debugging, we recommend using the `JavaScript Debug` Terminal with `debugger;` statements for debugging. Client code changes will automatically trigger a full browser refresh, while server source code changes will trigger the Vite server to rebuild configuration modules and automatically restart the service.
   - For **build-time injected client runtime** source code debugging, such as all modules included in `packages/vitepress/src/shared/runtime`, these are build-time runtime artifacts optimized for the client during the build process and do not support Hot Module Replacement (HMR). For development of such source code, we recommend enabling `pnpm build:watch` mode. Set `debugger;` breakpoints and manually execute the build to complete the build work for runtime artifacts, then debug in the browser through the preview environment. This process is quite cumbersome and will be further optimized for developer experience in the future. Fortunately, **build-time injected client runtime** source code typically does not change frequently.

Tip: To switch documentation back to the built package (default), run:

```bash
pnpm docs:link:prod
```

## Releasing Public Packages

Public npm releases are coordinated from the repository root. The local release
command creates the version commit and package-scoped git tags; npm publishing is
then performed by the `Publish npm packages` GitHub Actions workflow so npm can
attach provenance attestations.

- Preview the available release targets and choose interactively:

  ```bash
  pnpm release
  ```

  Use the arrow keys plus `Space` to select one or more packages, or choose `all public packages` for a batch release.

- Generate changelogs from the root for one or more public packages:

  ```bash
  pnpm changelog logaria --type patch
  pnpm changelog --package limina --type patch
  pnpm changelog --package logaria,vitepress --type prerelease --preid beta
  ```

- Run a non-mutating preview for a specific package:

  ```bash
  pnpm release logaria --type patch --dry-run --yes
  pnpm release --package limina --type patch --dry-run --yes
  pnpm release --package vitepress --type prerelease --preid beta --dry-run --yes
  ```

- Run the release from the repository root. On a local machine, npm publish is
  deferred until the pushed tag triggers GitHub Actions:

  ```bash
  pnpm release --package vitepress --type patch --yes
  ```

- Retry only the GitHub Actions publish step from an already tagged checkout:

  ```bash
  pnpm release publish --package vitepress --dry-run
  pnpm release publish --package vitepress
  ```

- Package-local compatibility commands still work:

  ```bash
  pnpm --filter logaria test
  pnpm --filter @docs-islands/vitepress changelog --type patch
  ```

Current public release targets:

- `logaria` -> `logaria`
- `limina` -> `limina`
- `vitepress` -> `@docs-islands/vitepress`

Each public package now uses package-scoped git tags:

- `logaria/v<version>`
- `limina/v<version>`
- `vitepress/v<version>`

The npm publish workflow grants `id-token: write` and runs
`pnpm release publish` with provenance enabled. Published versions should show
the green provenance check on npm. The npm package settings must trust this
repository workflow, using the `Release` environment.

## License

By contributing to Docs Islands, you agree that your contributions will be licensed under the [MIT License](https://github.com/XiSenao/docs-islands/blob/main/LICENSE).

This means:

- Your contributions become part of the open source project
- They can be freely used, modified, and distributed
- You retain the copyright to your original contributions
- You grant others the right to use your contributions under the MIT License

---

Thank you for contributing to Docs Islands! 🚀
