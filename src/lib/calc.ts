/**
 * A small calculator: + − × ÷ ^, brackets, percent, √ and π. It parses the
 * expression itself (no eval), so typing anything else is just an error.
 *
 *   expr   = term (("+" | "-") term)*
 *   term   = unary (("*" | "/") unary)*
 *   unary  = ("-" | "+") unary | power
 *   power  = postfix ("^" unary)?
 *   postfix = atom "%"*
 *   atom   = number | "pi" | "sqrt" atom | "(" expr ")"
 */
export function evaluate(input: string): number {
  const src = input
    .replace(/[×x]/g, "*")
    .replace(/÷/g, "/")
    .replace(/[−–]/g, "-")
    .replace(/π/g, "pi")
    .replace(/√/g, "sqrt")
    .replace(/,/g, "")
    .toLowerCase();
  let i = 0;

  const skip = () => {
    while (src[i] === " ") i++;
  };
  const peek = () => (skip(), src[i]);
  const take = (c: string) => (peek() === c ? (i++, true) : false);
  const word = (w: string) => (peek(), src.startsWith(w, i) ? ((i += w.length), true) : false);

  function expr(): number {
    let v = term();
    for (;;) {
      if (take("+")) v += term();
      else if (take("-")) v -= term();
      else return v;
    }
  }
  function term(): number {
    let v = unary();
    for (;;) {
      if (take("*")) v *= unary();
      else if (take("/")) v /= unary();
      else return v;
    }
  }
  function unary(): number {
    if (take("-")) return -unary();
    if (take("+")) return unary();
    return power();
  }
  function power(): number {
    const base = postfix();
    return take("^") ? base ** unary() : base;
  }
  function postfix(): number {
    let v = atom();
    while (take("%")) v /= 100;
    return v;
  }
  function atom(): number {
    if (take("(")) {
      const v = expr();
      if (!take(")")) throw new Error("Missing )");
      return v;
    }
    if (word("pi")) return Math.PI;
    if (word("sqrt")) return Math.sqrt(atom());
    const m = /^\d*\.?\d+(e[+-]?\d+)?|^\d+\./.exec(src.slice(i));
    if (!m) throw new Error("Unexpected input");
    i += m[0].length;
    return parseFloat(m[0]);
  }

  if (!peek()) throw new Error("Empty");
  const v = expr();
  if (peek() !== undefined) throw new Error("Unexpected input");
  if (!Number.isFinite(v)) throw new Error("Not a number");
  return v;
}

/** Up to 12 significant digits, without float noise such as 0.1 + 0.2. */
export function formatNumber(v: number): string {
  return String(Number(v.toPrecision(12)));
}
