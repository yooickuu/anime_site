"""Match public subtitle-directory entries by AniList ID, never by title alone.

This is discovery only: directory presence does not verify episode coverage,
language, subtitle timing, copyright permission, or playback compatibility.
No data is published by this script.
"""
import json
import sys
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.request import Request, urlopen


class Directory(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.entries = []
        self.current = None

    def handle_starttag(self, tag, attributes):
        attrs = dict(attributes)
        if tag == 'div' and attrs.get('class') == 'entry':
            try:
                self.current = json.loads(attrs.get('data-extra', '{}'))
            except json.JSONDecodeError:
                self.current = None
        if tag == 'a' and self.current and attrs.get('href', '').startswith('/entry/'):
            entry_id = attrs['href'].split('/')[-1]
            if entry_id.isdecimal():
                self.entries.append({**self.current, 'entryId': int(entry_id)})
                self.current = None


def main():
    source = Path(sys.argv[1] if len(sys.argv) > 1 else 'checks/admission/new-candidates.json')
    data = json.loads(source.read_text())
    candidates = data if isinstance(data, list) else data['items']
    by_id = {a['ids']['anilist']: a for a in candidates if a.get('ids', {}).get('anilist')}
    request = Request('https://jimaku.cc/', headers={'User-Agent': 'yomiku-source-check/1.0'})
    with urlopen(request, timeout=20) as response:
        body = response.read(8_000_001)
    if len(body) > 8_000_000:
        raise ValueError('Directory unexpectedly large; inspect before retrying')
    directory = Directory()
    directory.feed(body.decode('utf-8'))
    items = [{**a, 'candidateId': by_id[a['anilist_id']]['id'],
              'ids': by_id[a['anilist_id']]['ids'],
              'url': f"https://jimaku.cc/entry/{a['entryId']}"}
             for a in directory.entries if a.get('anilist_id') in by_id]
    report = {'checkedAt': datetime.now(timezone.utc).isoformat(),
              'kind': 'subtitle-directory-not-verified', 'source': 'https://jimaku.cc/',
              'directoryEntries': len(directory.entries), 'items': items,
              'matchedCandidates': len({a['candidateId'] for a in items})}
    dest = Path('checks/admission/jimaku-matches.json')
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print(json.dumps({key: report[key] for key in ['directoryEntries', 'matchedCandidates']}))


if __name__ == '__main__':
    main()
