# Diagram sources

- Next AI Draw.io: https://github.com/DayuanJiang/next-ai-draw-io. The build uses `@next-ai-drawio/mcp-server` 0.4.1 for XML normalization/validation and the native draw.io editor distributed in that package. [Apache-2.0 license](NEXT-AI-DRAWIO-LICENSE). Preserve the bundled draw.io notices when publishing its editor assets.
- The React SVG viewer, evidence bindings, step navigation, Dagre layout and XML generator are repository code under MIT. They are not the complete Next AI application. The viewport controls adapt the team `explain-visually` runtime from https://github.com/jungrok5/ai-code-collaboration-best-practices ([MIT notice](EXPLAIN-VISUALLY-LICENSE)).
- Diagram editing exports a separate file. It does not change report JSON, evidence bytes, causal claims or review state.
