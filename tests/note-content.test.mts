import assert from "node:assert/strict";
import test from "node:test";

import {
  removeMatchingLeadingTitle,
  removeRemoteSourcePreview,
} from "../src/vault/noteContent.ts";

test("removes only a matching leading level-one title", () => {
  assert.equal(
    removeMatchingLeadingTitle("# A long title\n\nBody\n", "A long title"),
    "Body\n",
  );
  assert.equal(
    removeMatchingLeadingTitle("# Escaped \\# title\r\n\r\nBody\r\n", "Escaped # title"),
    "Body\r\n",
  );
});

test("preserves different, nested, or non-leading headings", () => {
  assert.equal(
    removeMatchingLeadingTitle("# Different title\n\nBody\n", "File title"),
    "# Different title\n\nBody\n",
  );
  assert.equal(
    removeMatchingLeadingTitle("Intro\n\n# File title\n", "File title"),
    "Intro\n\n# File title\n",
  );
  assert.equal(
    removeMatchingLeadingTitle("## File title\n", "File title"),
    "## File title\n",
  );
});

test("removes only the generated remote source preview image", () => {
  const generated = "![Source preview](<https://images.example/preview.jpg>)\n\n## Brief\nBody\n";
  assert.equal(removeRemoteSourcePreview(generated), "\n## Brief\nBody\n");
  assert.equal(
    removeRemoteSourcePreview("![Chart](https://images.example/chart.png)\n"),
    "![Chart](https://images.example/chart.png)\n",
  );
  assert.equal(
    removeRemoteSourcePreview("![Source preview](images/local.png)\n"),
    "![Source preview](images/local.png)\n",
  );
});
