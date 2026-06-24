import test from "node:test";
import assert from "node:assert/strict";

import { WebSearchTool } from "../src/tools/implementations/web-search.tool";

test("WebSearchTool parses public web search results for query input", async () => {
  const tool = new WebSearchTool({
    fetchImpl: (async () =>
      new Response(
        `
          <html>
            <body>
              <ol>
                <li class="b_algo">
                  <h2><a href="https://example.com/result-1">Result One</a></h2>
                  <div class="b_caption">
                    <p>First result snippet.</p>
                  </div>
                </li>
                <li class="b_algo">
                  <h2><a href="https://example.com/result-2">Result Two</a></h2>
                  <div class="b_caption">
                    <p>Second result snippet.</p>
                  </div>
                </li>
              </ol>
            </body>
          </html>
        `,
        {
          status: 200,
          headers: {
            "content-type": "text/html; charset=utf-8"
          }
        }
      )) as typeof fetch
  });

  const result = await tool.execute({
    query: "example query",
    maxResults: 2
  });

  assert.equal(result.provider, "bing-search");
  assert.equal(result.results.length, 2);
  assert.equal(result.results[0]?.title, "Result One");
  assert.equal(result.results[0]?.url, "https://example.com/result-1");
  assert.equal(result.results[0]?.excerpt, "First result snippet.");
});
