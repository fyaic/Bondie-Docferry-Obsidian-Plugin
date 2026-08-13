import assert from "node:assert/strict";
import test from "node:test";

import { removeMatchingLeadingTitle } from "../src/vault/noteContent.ts";

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

test("preserves a DocFerry source thumbnail while removing a duplicate title", () => {
  const thumbnail = "![Source preview](<https://images.example/preview.jpg>)";
  assert.equal(
    removeMatchingLeadingTitle(`# Video title\n\n${thumbnail}\n\n## Brief\nBody\n`, "Video title"),
    `${thumbnail}\n\n## Brief\nBody\n`,
  );
});
