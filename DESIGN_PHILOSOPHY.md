# Design Philosophy: The Tripartite System

Figma Edit MCP operates as a synergistic system consisting of 3 parties: the **Plugin**, the **AI Assistant**, and the **Human Designer**.

1. **The Plugin (Execution & Protection):** It provides the API to Figma, but more importantly, it enforces strict programmatic checks and protections that even the native Figma Desktop app lacks.
2. **The AI Assistant (Scale & Orchestration):** Neither the plugin nor the designer can easily process and interpret massive quantities of design data for arbitrary, dynamic updates. The AI Assistant translates vague human intent into precise, exhaustive execution across hundreds of nodes.
3. **The Human Designer (UX Expertise):** Neither the plugin nor the AI Assistant are experts in UX design. The human designer makes the critical creative decisions and acts as the Visionary & Director of the entire system.

By combining the AI Assistant's ability to process large amounts of data with the Plugin's safety constraints, the Designer is freed to focus purely on creative decision-making, leaving the tedious and error-prone execution to the automated systems.