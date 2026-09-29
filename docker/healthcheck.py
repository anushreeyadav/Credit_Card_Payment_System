"""Container health check: GET a URL and expect a given HTTP status.

Usage: python healthcheck.py <url> [expected_status=200]
"""

import sys
import urllib.error
import urllib.request

url = sys.argv[1]
expected = int(sys.argv[2]) if len(sys.argv) > 2 else 200
try:
    status = urllib.request.urlopen(url, timeout=4).status
except urllib.error.HTTPError as error:
    status = error.code
except OSError:
    sys.exit(1)
sys.exit(0 if status == expected else 1)
