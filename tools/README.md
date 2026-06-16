# Tools

Document tool contracts, safety boundaries, and provider adapters for the execution framework here.

## Web Search Tool

- Purpose: fetch and summarize public webpages by URL for content understanding.
- Current mode: direct webpage fetch, not full search-engine integration.
- Supported input: full `http` or `https` URLs.
- Blocked targets: localhost, `.local`, loopback, link-local, and private-network IP ranges.
- Security boundary: this tool is SSRF-hardened and refuses local or internal addresses.
- Output: normalized page title, description, headings, and a bounded text excerpt for LLM context injection.
