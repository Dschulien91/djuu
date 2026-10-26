"""Coverage report: how many places per category and how well the family filters are filled."""
from common import connect

KEYS = ['changing_table', 'highchair', 'kids_area', 'dog', 'wheelchair', 'stroller', 'opening_hours', 'website', 'toilets', 'rating']


def run():
    con = connect()
    print('Quellen:')
    for row in con.execute('SELECT id, record_count, license, fetched_at FROM sources ORDER BY priority DESC, id'):
        print(f'  {row[0]:<22} {row[1] or 0:>7}  {row[2]:<14} {row[3]}')
    total = con.execute('SELECT COUNT(*) FROM places').fetchone()[0]
    print(f'\nOrte gesamt: {total}')
    cats = con.execute('SELECT category, COUNT(*) FROM places GROUP BY category ORDER BY 2 DESC').fetchall()
    known = {(c, k): n for c, k, n in con.execute(
        'SELECT p.category, f.key, COUNT(DISTINCT p.id) FROM places p JOIN place_facts f ON f.place_id = p.id GROUP BY 1, 2')}
    print(f"\n{'Kategorie':<20}{'Orte':>7}" + ''.join(f'{k[:10]:>12}' for k in KEYS))
    for c, n in cats:
        print(f'{c:<20}{n:>7}' + ''.join(f"{(100 * known.get((c, k), 0) // n):>11}%" for k in KEYS))
    multi = con.execute("""SELECT COUNT(*) FROM (SELECT place_id FROM source_records WHERE place_id IS NOT NULL
                           GROUP BY place_id HAVING COUNT(DISTINCT source_id) > 1)""").fetchone()[0]
    print(f'\nOrte mit mehreren Quellen: {multi}')


if __name__ == '__main__':
    run()
