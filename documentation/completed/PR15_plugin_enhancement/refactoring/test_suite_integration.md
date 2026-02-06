# Test Suite Integration Plan

## Goal Description
The goal is to establish a robust testing environment using Jest for the `figma-edit-mcp` project. This involves setting up the necessary configuration, dependencies, and directory structure. Crucially, to ensure "all existing functionality" is covered, we must refactor the monolithic `server.ts` file to make its functions and tools accessible and testable in isolation.

## User Review Required
> [!IMPORTANT]
> **Refactoring Required**: The current `server.ts` file does not export its helper functions or tool handlers, making them impossible to unit test directly. This plan includes a refactoring step to extract logic into testable modules.

## Proposed Changes

### 1. Verification of Test Framework
We will use **Jest** with `ts-jest` for TypeScript support. This is the industry standard for Node.js/TypeScript testing.

### 2. Implementation Steps

#### A. Install Dependencies
```bash
npm install --save-dev jest ts-jest @types/jest
```

#### B. Configure Jest
Create `jest.config.js`:
```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
  },
};
```

Update `package.json` scripts:
```json
"scripts": {
  ...
  "test": "jest",
  "test:watch": "jest --watch"
}
```

#### C. Refactoring for Testability (`src/mcp_server/`)
To test the logic without starting the server, we will componentize `server.ts`.

1.  **Extract Helpers**: Move specific logic to `src/mcp_server/utils.ts`.
    *   `normalizeNodeId`
    *   `normalizeNodeIds`
    *   `rgbaToHex`
    *   `filterFigmaNode`
2.  **Extract Client Logic**: Move Figma communication to `src/mcp_server/figma-client.ts`.
    *   `sendCommandToFigma` (Exported function that accepts the websocket/channel state or a simplified client class)
    *   *Alternative*: Keep it simple and just export `sendCommandToFigma` but allow injecting the dependency or mocking the module.
3.  **Refactor Tools**: Move tool definitions to `src/mcp_server/tools.ts`.
    *   Export a function `registerTools(server: McpServer)` or similar.
    *   This allows us to test the *handlers* by exporting them separately or by mocking the server passed to `registerTools`.

#### D. Create Test Suite (`tests/`)

1.  **`tests/utils.test.ts`**:
    *   Unit tests for `normalizeNodeId` (e.g., handles "1:2", "1-2", undefined).
    *   Unit tests for `rgbaToHex`.
    *   Unit tests for `filterFigmaNode`.
2.  **`tests/tools.test.ts`**:
    *   Tests for tool handlers (e.g., `get_document_info`, `create_rectangle`).
    *   Mocks `sendCommandToFigma` to verify it's called with correct parameters for each tool.
    *   Verifies the tool returns the expected matching content format.

## Verification Plan

### Automated Tests
Run `npm test` to execute the suite.
- Expect all tests to pass.
- Monitor coverage reports (optional, can add `--coverage`).

### Manual Verification
1.  Run `npm run build` to ensure the refactoring didn't break the build.
2.  Run the actual server and connect with Figma (using existing `start` script) to ensure no regression in runtime behavior.
