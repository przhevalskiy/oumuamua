import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/github/repos?token=<PAT>&page=1&per_page=30&q=<search>
 *
 * Proxies GitHub's repo search/list API using the user's PAT.
 * Returns repos the token has access to, sorted by last push.
 * The token never leaves the server — it's passed as a query param
 * from the client but only used server-side to call GitHub.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const token = searchParams.get('token') ?? '';
  const page = searchParams.get('page') ?? '1';
  const per_page = searchParams.get('per_page') ?? '30';
  const q = searchParams.get('q') ?? '';

  if (!token) {
    return NextResponse.json({ error: 'token is required' }, { status: 400 });
  }

  try {
    let url: string;
    if (q) {
      // Search repos the user has access to
      url = `https://api.github.com/search/repositories?q=${encodeURIComponent(q + ' user:@me')}&sort=updated&per_page=${per_page}&page=${page}`;
    } else {
      // List all repos the token can access
      url = `https://api.github.com/user/repos?sort=pushed&per_page=${per_page}&page=${page}&affiliation=owner,collaborator,organization_member`;
    }

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      next: { revalidate: 60 },
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return NextResponse.json(
        { error: body.message ?? `GitHub API error ${res.status}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    // Normalise search vs list response shape
    const repos = q ? (data.items ?? []) : data;

    const simplified = repos.map((r: Record<string, unknown>) => ({
      id: r.id,
      full_name: r.full_name,
      name: r.name,
      owner: (r.owner as Record<string, unknown>)?.login,
      private: r.private,
      description: r.description,
      html_url: r.html_url,
      clone_url: r.clone_url,
      default_branch: r.default_branch,
      pushed_at: r.pushed_at,
      language: r.language,
    }));

    return NextResponse.json({ repos: simplified });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
