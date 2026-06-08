import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { readFileSync, existsSync } from "fs";
import { logger } from "./logger.js";

/**
 * Registers all Figma Edit MCP resources.
 */
export function registerAllResources(server: McpServer) {
  // Resolve the path to skills/figma-edit/references/
  let skillsDirUrl = new URL("../skills/figma-edit/references/", import.meta.url);
  if (!existsSync(skillsDirUrl)) {
    skillsDirUrl = new URL("../../skills/figma-edit/references/", import.meta.url);
  }

  const resources = [
    {
      id: "constraints",
      title: "Figma Edit constraints guide",
      description: "Hard, plugin-enforced rules (scope, name verification, batch validation, URL IDs).",
    },
    {
      id: "error-playbook",
      title: "Figma Edit error playbook",
      description: "Recovery playbook for every structured error code.",
    },
    {
      id: "workflows",
      title: "Figma Edit workflows guide",
      description: "Discover-before-acting patterns and recipe skeletons.",
    },
    {
      id: "tool-selection",
      title: "Figma Edit tool selection guide",
      description: "Guidance on choosing the right tools, using node.info, batch vs single, etc.",
    },
    {
      id: "node-fields",
      title: "Figma Edit node_info field reference",
      description: "The full set of node_info `fields` (generated from @figma/plugin-typings), with types and how reference fields resolve.",
    },
  ];

  for (const res of resources) {
    const uri = `figma-edit://guide/${res.id}`;
    server.registerResource(
      res.id,
      uri,
      {
        title: res.title,
        description: res.description,
        mimeType: "text/markdown",
      },
      async (url) => {
        try {
          const fileUrl = new URL(`${res.id}.md`, skillsDirUrl);
          if (!existsSync(fileUrl)) {
            throw new Error(`Reference file ${res.id}.md not found`);
          }
          const text = readFileSync(fileUrl, "utf-8");
          return {
            contents: [
              {
                uri: url.toString(),
                text: text,
              },
            ],
          };
        } catch (error) {
          const errorMsg = `Error reading guide: ${error instanceof Error ? error.message : String(error)}`;
          logger.error(errorMsg);
          return {
            contents: [
              {
                uri: url.toString(),
                text: `# Error\n\n${errorMsg}`,
              },
            ],
          };
        }
      }
    );
  }
}
