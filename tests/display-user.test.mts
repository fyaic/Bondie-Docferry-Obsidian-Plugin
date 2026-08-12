import assert from "node:assert/strict";
import test from "node:test";

import {
  displayNameFromUser,
  initialsFromDisplayUser,
} from "../src/account/displayUser.ts";

test("uses a display name while preserving a stable avatar fallback", () => {
  const user = {
    email: "person@example.com",
    name: "Example Person",
    picture: "https://images.example.com/person.png",
  };

  assert.equal(displayNameFromUser(user), "Example Person");
  assert.equal(initialsFromDisplayUser(user), "EP");
});

test("falls back from email to a private product label", () => {
  assert.equal(displayNameFromUser({ email: "person@example.com" }), "person@example.com");
  assert.equal(initialsFromDisplayUser({ email: "person@example.com" }), "PE");
  assert.equal(displayNameFromUser(null), "Bondie account");
  assert.equal(initialsFromDisplayUser(null), "BA");
});
