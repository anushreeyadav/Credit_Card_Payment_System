from django.conf import settings


class ApiNoStoreMiddleware:
    """API responses carry card, payment and account data: forbid caching them
    in browsers and shared proxies."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        if request.path.startswith('/api/'):
            response['Cache-Control'] = 'no-store'
        return response


class RealClientIPMiddleware:
    """Sets REMOTE_ADDR to the real client address when behind trusted proxies.

    X-Forwarded-For is client-controlled, so it is only used when
    settings.NUM_PROXIES > 0, and then only the entry added by the outermost
    trusted proxy is taken (the N-th from the right). With NUM_PROXIES = 0 the
    header is ignored entirely.
    """

    def __init__(self, get_response):
        self.get_response = get_response
        self.num_proxies = settings.NUM_PROXIES

    def __call__(self, request):
        if self.num_proxies > 0:
            hops = [h.strip() for h in request.META.get('HTTP_X_FORWARDED_FOR', '').split(',') if h.strip()]
            if len(hops) >= self.num_proxies:
                request.META['REMOTE_ADDR'] = hops[-self.num_proxies]
        return self.get_response(request)
