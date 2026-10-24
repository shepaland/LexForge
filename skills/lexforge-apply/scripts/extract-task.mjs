import { readFileSync } from 'node:fs';

// Read a section file or a legacy monolith; never follow links or execute its text.
try {
  const [file, id, ...extra] = process.argv.slice(2);
  if (!file || !/^\d+(?:\.\d+)+$/.test(id ?? '') || extra.length) {
    throw new Error('Usage: node extract-task.mjs <plan-or-section.md> <task-id>');
  }
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  const tasks = [];
  let fence;
  let current;
  for (const line of lines) {
    const marker = /^\s*(`{3,}|~{3,})/.exec(line)?.[1];
    if (fence) {
      if (current) current.lines.push(line);
      if (marker?.[0] === fence[0] && marker.length >= fence.length &&
          line.trim() === marker) fence = undefined;
      continue;
    }
    if (marker) {
      fence = marker;
      if (current) current.lines.push(line);
      continue;
    }
    const task = /^\s*- \[[ xX]\]\s+(\d+(?:\.\d+)+)\b/.exec(line);
    if (task) {
      current = { id: task[1], lines: [line] };
      tasks.push(current);
    } else if (/^#{1,2}\s/.test(line)) {
      current = undefined;
    } else if (current) current.lines.push(line);
  }
  const matches = tasks.filter(task => task.id === id);
  if (matches.length !== 1) throw new Error(`Expected one task ${id}; found ${matches.length}`);
  process.stdout.write(matches[0].lines.join('\n').trimEnd() + '\n');
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
