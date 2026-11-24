# Security policy

## Reporting a vulnerability

Please do not open a public issue for a security problem.

Use the **Report a vulnerability** button in the
[Security tab](https://github.com/Leylines-Prism/bpmn-editor/security) of this repository. The
report stays private until a fix is published.

Useful details: the version or commit, how to reproduce it, and what an attacker could do with it.
Never include a real API key.

## What is in scope

- The editor and the online demo (API keys kept in the browser, content sent to AI providers).
- The MCP server and the built-in assistant in `mcp/` (token check, allowed origins and hosts,
  saved diagrams).
- The Docker images published from this repository.

The security of the AI providers themselves, and of the reverse proxy or network you put in front
of the Docker version, is outside this project.

## Supported versions

Only the latest release and the `main` branch receive fixes.

This is a personal project maintained in spare time: reports are read, but there is no guaranteed
response time.
