import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  InitializeParams,
  TextDocumentSyncKind,
  InitializeResult,
  Connection,
  Hover,
  Definition,
  DidChangeConfigurationNotification,
} from "vscode-languageserver/node";

import { TextDocument } from "vscode-languageserver-textdocument";
import { URI } from "vscode-uri";
import { Logger } from "./logger";
import { HoverProvider } from "./lspCapabilities/hoverProvider";
import { DefinitionProvider } from "./lspCapabilities/definitionProvider";

interface LSSettings {
  hover?: {
    enabled?: boolean;
  };
  logLevel?: string;
}

const DEFAULT_SETTINGS: LSSettings = {
  hover: { enabled: true },
  logLevel: "info",
};

export class LiquidLanguageServer {
  private connection: Connection;
  private documents: TextDocuments<TextDocument> = new TextDocuments(
    TextDocument,
  );
  private logger: Logger;
  private workspaceRoot: string | null = null;
  private hasConfigurationCapability: boolean = false;
  private hasWorkspaceFolderCapability: boolean = false;
  private settings: LSSettings = DEFAULT_SETTINGS;

  constructor(connection?: Connection) {
    this.connection = connection || createConnection(ProposedFeatures.all);

    this.logger = new Logger("LiquidLanguageServer");
    this.setupHandlers();
  }

  private setupHandlers(): void {
    this.connection.onInitialize((params: InitializeParams) => {
      // Update log level and settings from initialization options if provided
      const initOptions = params.initializationOptions as
        | LSSettings
        | undefined;

      if (initOptions) {
        this.settings = { ...DEFAULT_SETTINGS, ...initOptions };
      }

      const logLevel = this.settings.logLevel || DEFAULT_SETTINGS.logLevel!;
      Logger.configure({
        level: logLevel,
      });
      this.logger.info(`Log level set to: ${logLevel}`);

      this.logger.info("Server initializing");

      // Check client capabilities
      const capabilities = params.capabilities;
      this.hasConfigurationCapability = !!(
        capabilities.workspace && !!capabilities.workspace.configuration
      );
      this.hasWorkspaceFolderCapability = !!(
        capabilities.workspace && !!capabilities.workspace.workspaceFolders
      );

      if (params.rootUri) {
        this.workspaceRoot = URI.parse(params.rootUri).fsPath;
        this.logger.info(`Workspace root: ${this.workspaceRoot}`);
      } else if (params.rootPath) {
        this.workspaceRoot = params.rootPath;
        this.logger.info(`Workspace root (legacy): ${this.workspaceRoot}`);
      }

      const result: InitializeResult = {
        capabilities: {
          textDocumentSync: TextDocumentSyncKind.Full,
          hoverProvider: true,
          definitionProvider: true,
          ...(this.hasConfigurationCapability && {
            workspace: {
              workspaceFolders: {
                supported: this.hasWorkspaceFolderCapability,
              },
            },
          }),
        },
      };
      return result;
    });

    this.connection.onInitialized(() => {
      this.logger.info("Server initialized");

      if (this.hasConfigurationCapability) {
        // Register for all configuration changes
        this.connection.client.register(
          DidChangeConfigurationNotification.type,
          undefined,
        );
      }
    });

    this.connection.onDidChangeConfiguration((change) => {
      if (this.hasConfigurationCapability) {
        // Reset all cached document settings
        this.logger.info("Configuration changed, updating settings");
      } else {
        this.settings = {
          ...DEFAULT_SETTINGS,
          ...(change.settings.liquidLS || {}),
        };
      }
      this.logger.info(
        `Hover enabled: ${this.settings.hover?.enabled ?? DEFAULT_SETTINGS.hover!.enabled}`,
      );
    });

    // this.connection.onDidChangeWatchedFiles((_change) => {
    //   this.logger.logRequest("didChangeWatchedFiles");
    //   this.connection.console.log("File change event received");
    // });
    //
    // this.documents.onDidChangeContent((change) => {
    //   this.logger.logRequest("didChangeContent");
    //   this.connection.console.log(`didChangeContent: ${change.document.uri}`);
    // });

    this.connection.onHover(async (params): Promise<Hover | null> => {
      if (!(this.settings.hover?.enabled ?? DEFAULT_SETTINGS.hover!.enabled)) {
        this.logger.debug("Hover is disabled in settings");
        return null;
      }

      this.logger.logRequest("onHover", params);
      this.connection.console.log(
        `Hover request for: ${params.textDocument.uri}`,
      );

      const hoverProvider = new HoverProvider(params, this.workspaceRoot);
      const response = await hoverProvider.handleHoverRequest();
      if (response) {
        return {
          contents: response,
        };
      }
      return null;
    });

    this.connection.onDefinition(async (params): Promise<Definition | null> => {
      this.connection.console.log(
        `Definition request for: ${params.textDocument.uri}`,
      );

      const definitionProvider = new DefinitionProvider(
        params,
        this.workspaceRoot,
      );
      const response = await definitionProvider.handleDefinitionRequest();
      return response;
    });

    this.documents.listen(this.connection);
  }

  public start(): void {
    this.connection.listen();
  }

  public stop(): void {
    this.connection.dispose();
  }
}
