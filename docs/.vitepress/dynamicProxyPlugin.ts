import httpProxy from 'http-proxy';
import { createLogger } from 'logaria';
import { createElapsedTimer } from 'logaria/helper';
import type { ScopedLogger } from 'logaria/types';
import type { ChildProcess } from 'node:child_process';
import { spawn } from 'node:child_process';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Socket } from 'node:net';
import type { Plugin } from 'vitepress';

interface ProjectInfo {
  port: number;
  process: ChildProcess;
}

interface ProxyConfig {
  validProjects: string[];
  basePath: string;
  packageScope: string;
  devCommand: string;
  startupTimeout: number;
  shutdownTimeout: number;
}

const DEFAULT_CONFIG: ProxyConfig = {
  validProjects: ['vitepress', 'limina', 'logaria'],
  basePath: '/docs-islands',
  packageScope: '@docs-islands',
  devCommand: 'docs:dev',
  startupTimeout: 60_000,
  shutdownTimeout: 5000,
};

const logger = createLogger({
  main: '@docs-islands/monorepo-docs',
}).getLoggerByGroup('plugin.docs.dynamic-proxy');

class ProjectManager {
  private runningProjects = new Map<string, ProjectInfo>();
  private startingProjects = new Map<string, Promise<number>>();
  private logger: ScopedLogger;
  private cleanupHandlers: (() => void)[] = [];
  private config: ProxyConfig;

  constructor(config: ProxyConfig, logger: ScopedLogger) {
    this.config = config;
    this.logger = logger;
  }

  async getOrStartProject(projectName: string): Promise<ProjectInfo> {
    const requestElapsed = createElapsedTimer();
    const docsPackageName = `${projectName}-docs`;

    const existing = this.runningProjects.get(docsPackageName);
    if (existing) {
      this.logger.debug(
        `Project ${docsPackageName} already running on port ${existing.port}`,
      );
      return existing;
    }

    // Check if already starting (mutex lock).
    const starting = this.startingProjects.get(docsPackageName);
    if (starting) {
      this.logger.debug(
        `Project ${docsPackageName} is already starting, waiting...`,
      );
      await starting;
      const projectInfo = this.runningProjects.get(docsPackageName);
      if (!projectInfo) {
        throw new Error(
          `Project ${docsPackageName} started but not found in registry`,
        );
      }
      return projectInfo;
    }

    this.logger.info(
      `Lazy starting dev server for: ${this.config.packageScope}/${docsPackageName}...`,
      requestElapsed(),
    );
    const startPromise = this.startProjectServer(docsPackageName);
    this.startingProjects.set(docsPackageName, startPromise);

    try {
      await startPromise;
      const projectInfo = this.runningProjects.get(docsPackageName);
      if (!projectInfo) {
        throw new Error(
          `Project ${docsPackageName} started but not found in registry`,
        );
      }
      return projectInfo;
    } finally {
      this.startingProjects.delete(docsPackageName);
    }
  }

  private async startProjectServer(docsPackageName: string): Promise<number> {
    const serverStartElapsed = createElapsedTimer();
    return new Promise((resolve, reject) => {
      const projectProcess = spawn(
        'pnpm',
        [
          '--filter',
          `${this.config.packageScope}/${docsPackageName}`,
          this.config.devCommand,
        ],
        {
          shell: true,
          stdio: ['pipe', 'pipe', 'pipe'],
        },
      );

      let resolved = false;
      const timeout = setTimeout(() => {
        if (!resolved) {
          reject(
            new Error(
              `Timeout: ${docsPackageName} server failed to start within ${this.config.startupTimeout}ms`,
            ),
          );
          projectProcess.kill('SIGKILL');
        }
      }, this.config.startupTimeout);

      const handleOutput = (data: Buffer) => {
        const output = data.toString();
        this.logger.debug(`[${docsPackageName}] ${output.trim()}`);

        const regex = /https?:\/\/localhost:(\d+)/;
        const match = regex.exec(output);
        if (match?.[1] && !resolved) {
          const port = Number.parseInt(match[1], 10);
          this.verifyServerHealth(port)
            .then(() => {
              resolved = true;
              clearTimeout(timeout);
              this.logger.info(
                `✓ ${this.config.packageScope}/${docsPackageName} running on port: ${port}`,
                serverStartElapsed(),
              );
              this.runningProjects.set(docsPackageName, {
                port,
                process: projectProcess,
              });
              resolve(port);
            })
            .catch((error) => {
              this.logger.warn(
                `Port ${port} detected but health check failed: ${error}`,
                serverStartElapsed(),
              );
            });
        }
      };

      projectProcess.stdout.on('data', handleOutput);
      projectProcess.stderr.on('data', (data) => {
        const output = data.toString();
        this.logger.error(
          `[${docsPackageName}] ${output.trim()}`,
          serverStartElapsed(),
        );
        handleOutput(data);
      });

      projectProcess.on('exit', (code) => {
        clearTimeout(timeout);
        this.logger.info(
          `${this.config.packageScope}/${docsPackageName} server exited with code ${code}`,
          serverStartElapsed(),
        );
        this.runningProjects.delete(docsPackageName);
        if (code !== 0 && !resolved) {
          reject(
            new Error(`${docsPackageName} server exited with code ${code}`),
          );
        }
      });
    });
  }

  private async verifyServerHealth(port: number, retries = 3): Promise<void> {
    for (let i = 0; i < retries; i++) {
      try {
        const response = await fetch(`http://localhost:${port}`, {
          method: 'HEAD',
          signal: AbortSignal.timeout(2000),
        });
        if (response.ok || response.status === 404) {
          return;
        }
      } catch (error) {
        if (i === retries - 1) throw error;
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }

  async cleanup(): Promise<void> {
    this.logger.info('Shutting down child servers...');
    const shutdownPromises: Promise<void>[] = [];

    for (const [
      docsPackageName,
      { process },
    ] of this.runningProjects.entries()) {
      shutdownPromises.push(this.shutdownProcess(docsPackageName, process));
    }

    await Promise.allSettled(shutdownPromises);
    this.runningProjects.clear();
    this.startingProjects.clear();
  }

  private async shutdownProcess(
    docsPackageName: string,
    childProcess: ChildProcess,
  ): Promise<void> {
    const shutdownElapsed = createElapsedTimer();
    return new Promise((resolve) => {
      this.logger.info(
        `Shutting down ${docsPackageName} server...`,
        shutdownElapsed(),
      );

      const forceKillTimer = setTimeout(() => {
        this.logger.warn(
          `${docsPackageName} did not exit gracefully, sending SIGKILL`,
          shutdownElapsed(),
        );
        childProcess.kill('SIGKILL');
      }, this.config.shutdownTimeout);

      childProcess.once('exit', () => {
        clearTimeout(forceKillTimer);
        resolve();
      });

      childProcess.kill('SIGTERM');
    });
  }

  registerCleanupHandler(handler: () => void): void {
    this.cleanupHandlers.push(handler);
  }
}

class ProxyHandler {
  private proxy: httpProxy;
  private logger: ScopedLogger;
  private config: ProxyConfig;
  private projectManager: ProjectManager;

  constructor(
    config: ProxyConfig,
    projectManager: ProjectManager,
    logger: ScopedLogger,
  ) {
    this.config = config;
    this.projectManager = projectManager;
    this.logger = logger;
    this.proxy = httpProxy.createProxyServer({
      proxyTimeout: 30_000,
      timeout: 30_000,
    });

    this.setupProxyErrorHandlers();
  }

  private setupProxyErrorHandlers(): void {
    const proxyElapsed = createElapsedTimer();

    this.proxy.on('error', (err, _req, res) => {
      const errorType = this.classifyError(err);
      this.logger.error(
        `Proxy error [${errorType}]: ${err.message}`,
        proxyElapsed(),
      );

      if ('headersSent' in res && res.headersSent) {
        this.logger.warn(
          'Headers already sent, cannot send error response',
          proxyElapsed(),
        );
        return;
      }

      if ('writeHead' in res && typeof res.writeHead === 'function') {
        try {
          const statusCode = errorType === 'TIMEOUT' ? 504 : 502;
          const message =
            errorType === 'TIMEOUT'
              ? 'Gateway Timeout: Target server did not respond in time'
              : `Bad Gateway: ${err.message}`;

          res.writeHead(statusCode, { 'Content-Type': 'text/plain' });
          res.end(message);
        } catch (writeError) {
          this.logger.error(
            `Failed to send error response: ${writeError}`,
            proxyElapsed(),
          );
        }
      }
    });

    this.proxy.on('proxyReq', (_proxyReq, req) => {
      this.logger.debug(`Proxying ${req.method} ${req.url}`);
    });

    this.proxy.on('proxyRes', (proxyRes, req) => {
      this.logger.debug(
        `Received ${proxyRes.statusCode} for ${req.method} ${req.url}`,
      );
    });
  }

  private classifyError(
    err: Error,
  ): 'TIMEOUT' | 'CONNECTION_REFUSED' | 'ECONNRESET' | 'OTHER' {
    const message = err.message.toLowerCase();
    if (message.includes('timeout') || err.name === 'TimeoutError')
      return 'TIMEOUT';
    if (message.includes('econnrefused')) return 'CONNECTION_REFUSED';
    if (message.includes('econnreset')) return 'ECONNRESET';
    return 'OTHER';
  }

  async handleHttpRequest(
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void,
  ): Promise<void | boolean> {
    const requestElapsed = createElapsedTimer();
    if (!req.url) return next();

    const packageName = this.findMatchingProject(req.url);
    if (!packageName) return next();

    try {
      const projectInfo =
        await this.projectManager.getOrStartProject(packageName);
      // const originalUrl = req.url;

      // this.logger.info(
      //   `HTTP ${req.method} ${originalUrl} -> http://localhost:${projectInfo.port}${originalUrl}`,
      // );

      this.proxy.web(req, res, {
        target: `http://localhost:${projectInfo.port}`,
        changeOrigin: true,
        preserveHeaderKeyCase: true,
        autoRewrite: true,
      });
    } catch (error) {
      this.logger.error(
        `Failed to proxy HTTP request for ${packageName}: ${error}`,
        requestElapsed(),
      );

      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'text/plain');
        res.end(
          `Internal Server Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    }
    return undefined;
  }

  async handleWebSocketUpgrade(
    req: IncomingMessage,
    socket: Socket,
    head: Buffer,
  ): Promise<void> {
    const requestElapsed = createElapsedTimer();

    const url = req.url;
    if (!url) return;

    const packageName = this.findMatchingProject(url);
    if (!packageName) return;

    try {
      const projectInfo =
        await this.projectManager.getOrStartProject(packageName);

      this.logger.info(
        `WebSocket ${url} -> ws://localhost:${projectInfo.port}${url}`,
      );

      this.proxy.ws(req, socket, head, {
        target: `ws://localhost:${projectInfo.port}`,
        ws: true,
        changeOrigin: true,
      });
    } catch (error) {
      this.logger.error(
        `Failed to proxy WebSocket for ${packageName}: ${error}`,
        requestElapsed(),
      );
      socket.destroy();
    }
  }

  private findMatchingProject(url: string): string | undefined {
    return this.config.validProjects.find((packageName) => {
      const base = `${this.config.basePath}/${packageName}`;
      return (
        url === base || url.startsWith(`${base}/`) || url.startsWith(`${base}?`)
      );
    });
  }

  destroy(): void {
    this.proxy.close();
  }
}

export function dynamicProxyPlugin(userConfig?: Partial<ProxyConfig>): Plugin {
  const config: ProxyConfig = { ...DEFAULT_CONFIG, ...userConfig };
  const projectManager = new ProjectManager(config, logger);
  const proxyHandler = new ProxyHandler(config, projectManager, logger);

  let cleanupRegistered = false;

  return {
    name: 'vite-plugin-dynamic-proxy',
    apply: 'serve',
    configureServer(server) {
      // HTTP middleware.
      server.middlewares.use((req, res, next) => {
        const middlewareElapsed = createElapsedTimer();
        proxyHandler.handleHttpRequest(req, res, next).catch((error) => {
          logger.error(
            `Unexpected error in HTTP middleware: ${error}`,
            middlewareElapsed(),
          );
          next();
        });
      });

      // WebSocket upgrade handler.
      server.httpServer?.on('upgrade', (req, socket, head) => {
        const upgradeElapsed = createElapsedTimer();
        proxyHandler
          .handleWebSocketUpgrade(req, socket, head)
          .catch((error) => {
            logger.error(
              `Unexpected error in WebSocket upgrade: ${error}`,
              upgradeElapsed(),
            );
            socket.destroy();
          });
      });

      // Register cleanup handlers only once.
      if (!cleanupRegistered) {
        cleanupRegistered = true;
        const shutdownElapsed = createElapsedTimer();

        const shutdownHandler = () => {
          logger.info(
            'Received shutdown signal, cleaning up...',
            shutdownElapsed(),
          );
          projectManager
            .cleanup()
            .then(() => {
              proxyHandler.destroy();
              logger.info('Cleanup completed', shutdownElapsed());
              process.exit(0);
            })
            .catch((error) => {
              logger.error(`Error during cleanup: ${error}`, shutdownElapsed());
              process.exit(1);
            });
        };

        /**
         * Note: 'exit' event doesn't allow async operations, so we skip it.
         * SIGINT and SIGTERM are the proper cleanup points.
         */
        process.once('SIGINT', shutdownHandler);
        process.once('SIGTERM', shutdownHandler);
      }
    },

    async closeBundle() {
      // Cleanup when Vite server closes.
      return projectManager.cleanup().then(() => {
        proxyHandler.destroy();
      });
    },
  };
}
