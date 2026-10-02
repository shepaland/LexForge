/** Zero-based line indexes inside fenced examples, including the fences themselves. */
export function fencedLines(lines: string[]): Set<number> {
  const ignored = new Set<number>();
  let marker = "";
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!;
    const fence = /^\s*(`{3,}|~{3,})(.*)$/.exec(line);
    if (marker) {
      ignored.add(index);
      if (
        fence &&
        fence[1]![0] === marker[0] &&
        fence[1]!.length >= marker.length &&
        fence[2]!.trim() === ""
      )
        marker = "";
    } else if (fence) {
      ignored.add(index);
      marker = fence[1]!;
    }
  }
  return ignored;
}
