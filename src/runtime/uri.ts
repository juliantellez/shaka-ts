/**
 * A replacement for `goog.Uri`, backed by the platform `URL`.
 *
 * The awkward part is that `goog.Uri` accepts relative references and resolves
 * one relative reference against another, while `URL` requires an absolute
 * base and throws otherwise. Manifest parsing depends on that relative
 * behaviour, since a DASH or HLS manifest routinely contains a relative
 * `BaseURL` resolved against another relative path.
 *
 * So this keeps the reference as text and resolves against a synthetic origin
 * when the base is relative, stripping the origin afterwards. That reproduces
 * RFC 3986 resolution without requiring an absolute base.
 */

/** Never appears in real content, so stripping it back off is unambiguous. */
const SYNTHETIC_ORIGIN = 'http://shaka-ts.invalid';

function isAbsolute(reference: string): boolean {
  return URL.canParse(reference);
}

export class Uri {
  private reference: string;

  public constructor(reference: string | Uri = '') {
    this.reference = reference instanceof Uri ? reference.reference : reference;
  }

  /**
   * Resolves a reference against this one, following RFC 3986.
   *
   * Returns a new instance. The receiver is never mutated, matching how
   * `goog.Uri.resolve` is used at the call sites.
   */
  public resolve(other: Uri | string): Uri {
    const relative = other instanceof Uri ? other.reference : other;

    if (isAbsolute(relative)) {
      return new Uri(relative);
    }

    if (isAbsolute(this.reference)) {
      return new Uri(new URL(relative, this.reference).toString());
    }

    const base = new URL(this.reference, `${SYNTHETIC_ORIGIN}/`);
    const resolved = new URL(relative, base).toString();
    const stripped = resolved.slice(SYNTHETIC_ORIGIN.length);

    // A base with no leading slash must not gain one from the synthetic origin.
    if (!this.reference.startsWith('/') && stripped.startsWith('/')) {
      return new Uri(stripped.slice(1));
    }
    return new Uri(stripped);
  }

  /** Replaces the query string. Accepts `a=1&b=2` with or without a leading `?`. */
  public setQueryData(query: string): void {
    const normalised = query.startsWith('?') ? query.slice(1) : query;
    const [withoutFragment, fragment] = splitOnce(this.reference, '#');
    const [path] = splitOnce(withoutFragment, '?');
    const rebuilt = normalised === '' ? path : `${path}?${normalised}`;
    this.reference = fragment === undefined ? rebuilt : `${rebuilt}#${fragment}`;
  }

  public toString(): string {
    return this.reference;
  }
}

function splitOnce(value: string, separator: string): [string, string?] {
  const at = value.indexOf(separator);
  if (at === -1) {
    return [value];
  }
  return [value.slice(0, at), value.slice(at + separator.length)];
}
