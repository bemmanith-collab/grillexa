// "Good morning, Vijay" — the hello on the way in.
//
// The hour comes from the browser, not the server: it is a greeting, so the
// time that matters is where the person reading it is standing. That also
// means the boundaries below are the whole of the logic, and an off-by-one
// here would greet the early shift with "Good afternoon" and nothing would
// ever flag it — hence test/greeting.js.
//
// Returns '' when there is no usable name, so the caller can send them
// straight into the app instead of showing half a sentence.
export function greetingFor(name, hour = new Date().getHours()) {
  const first = String(name || '').trim().split(/\s+/)[0];
  if (!first) return '';
  const partOfDay = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  return `${partOfDay}, ${first}`;
}
