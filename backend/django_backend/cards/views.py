from django.utils.decorators import method_decorator
from django.views.decorators.debug import sensitive_post_parameters
from drf_spectacular.utils import OpenApiExample, OpenApiResponse, extend_schema, extend_schema_view
from rest_framework import mixins, viewsets

from config.openapi import UNAUTHORIZED, error, validation_error

from .models import Card
from .serializers import CardSerializer


NOT_FOUND = error("No such card, or it belongs to another user.", 'No Card matches the given query.')


@extend_schema(tags=['Cards'])
@extend_schema_view(
    list=extend_schema(
        summary='List your saved cards',
        description='Your cards only, newest first. Card numbers are always masked.',
        responses={200: CardSerializer(many=True), 401: UNAUTHORIZED},
    ),
    create=extend_schema(
        summary='Add a card',
        description='Send the full card number once; only `last4`, the masked number and the card type are '
        'stored. `cvv` is optional, validated and **never stored**. The card number must pass the Luhn check '
        'and be Visa, Mastercard, American Express, Discover or RuPay. Expired cards are rejected.',
        responses={
            201: CardSerializer,
            400: validation_error({'card_number': ['Card number is invalid.'],
                                   'expiry_month': ['Card has expired.']}),
            401: UNAUTHORIZED,
        },
        examples=[OpenApiExample('Visa test card', request_only=True, value={
            'card_number': '4111 1111 1111 1111', 'cardholder_name': 'Priya Sharma',
            'expiry_month': 12, 'expiry_year': 2028})],
    ),
    destroy=extend_schema(
        summary='Delete a card',
        description='Past transactions made with the card are kept.',
        responses={204: OpenApiResponse(description='Deleted.'), 401: UNAUTHORIZED, 404: NOT_FOUND},
    ),
)
@method_decorator(sensitive_post_parameters('card_number', 'cvv'), name='dispatch')
class CardViewSet(
    mixins.CreateModelMixin,
    mixins.ListModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """POST/GET /api/cards/ and DELETE /api/cards/{id}/ for the current user.

    The queryset is always limited to the requesting user's cards, so another
    user's card id returns 404 and its existence is not revealed.
    """

    serializer_class = CardSerializer

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):  # OpenAPI schema generation, no real user
            return Card.objects.none()
        return Card.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)
