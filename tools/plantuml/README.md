# Local PlantUML Setup

EngineerOS supports both:
1. **Online SVG Rendering (Default)**: Automatically encodes PlantUML via `plantuml-encoder` and fetches high-resolution SVG diagrams from the official PlantUML server without requiring any local dependencies.
2. **Offline Local Java Rendering**: If you want to render PlantUML diagrams 100% offline without internet access:
   - Install Java (JRE / JDK 11+).
   - Download `plantuml.jar` from https://plantuml.com/download or https://github.com/plantuml/plantuml/releases.
   - Place `plantuml.jar` in this folder: `tools/plantuml/plantuml.jar`.
   - EngineerOS will automatically detect the local JAR and use `java -jar tools/plantuml/plantuml.jar -tsvg`.
