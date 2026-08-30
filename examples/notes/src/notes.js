export function addNote(notes, text) {
  return [...notes, { id: notes.length + 1, text }];
}

export function listNotes(notes) {
  return notes.map((note) => `${note.id}. ${note.text}`);
}

export function searchNotes(notes, query) {
  const needle = query.toLowerCase();
  return notes.filter((note) => note.text.toLowerCase().includes(needle));
}
