import assert from "node:assert/strict";
import { test } from "node:test";

import { addNote, listNotes, searchNotes } from "../src/notes.js";

test("addNote appends a note with the next id", () => {
  assert.deepEqual(addNote([], "buy milk"), [{ id: 1, text: "buy milk" }]);
});

test("listNotes numbers every note", () => {
  assert.deepEqual(listNotes([{ id: 1, text: "buy milk" }]), ["1. buy milk"]);
});

test("searchNotes keeps the matching notes in order", () => {
  const notes = [
    { id: 1, text: "buy milk" },
    { id: 2, text: "call the bank" },
    { id: 3, text: "buy bread" },
  ];

  assert.deepEqual(searchNotes(notes, "buy"), [notes[0], notes[2]]);
});

test("searchNotes ignores the case of both sides", () => {
  assert.deepEqual(searchNotes([{ id: 1, text: "Buy milk" }], "buy"), [{ id: 1, text: "Buy milk" }]);
});

test("searchNotes answers an empty list when nothing matches", () => {
  assert.deepEqual(searchNotes([{ id: 1, text: "buy milk" }], "sell"), []);
});

test("searchNotes answers every note on an empty query", () => {
  const notes = [{ id: 1, text: "buy milk" }];

  assert.deepEqual(searchNotes(notes, ""), notes);
});
