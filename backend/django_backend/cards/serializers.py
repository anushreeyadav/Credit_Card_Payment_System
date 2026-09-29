import re

from django.utils import timezone
from django.views.decorators.debug import sensitive_variables
from rest_framework import serializers

from .models import Card
from .validators import detect_card_type, mask_last4, normalize_card_number, passes_luhn

# How far ahead an expiry date may be.
MAX_EXPIRY_YEARS_AHEAD = 20


class CardSerializer(serializers.ModelSerializer):
    """Accepts a full card number (and optional CVV) on input, stores neither.

    card_number and cvv are write-only: they are validated, used to derive
    last4 / masked_number / card_type, and then dropped from validated_data
    before anything is saved.
    """

    card_number = serializers.CharField(write_only=True, max_length=23, trim_whitespace=True)
    cvv = serializers.CharField(write_only=True, required=False, max_length=4)

    class Meta:
        model = Card
        fields = [
            'id',
            'card_number',
            'cvv',
            'cardholder_name',
            'card_type',
            'masked_number',
            'last4',
            'expiry_month',
            'expiry_year',
            'created_at',
        ]
        read_only_fields = ['id', 'card_type', 'masked_number', 'last4', 'created_at']

    @sensitive_variables('value', 'number')
    def validate_card_number(self, value):
        number = normalize_card_number(value)
        if number is None:
            raise serializers.ValidationError('Card number must contain only digits.')
        if not 13 <= len(number) <= 19:
            raise serializers.ValidationError('Card number must be 13 to 19 digits long.')
        if not passes_luhn(number):
            raise serializers.ValidationError('Card number is invalid.')
        if detect_card_type(number) is None:
            raise serializers.ValidationError('Card type is not supported.')
        return number

    @sensitive_variables('value')
    def validate_cvv(self, value):
        if not re.fullmatch(r'\d{3,4}', value):
            raise serializers.ValidationError('CVV must be 3 or 4 digits.')
        return value

    def validate_cardholder_name(self, value):
        value = ' '.join(value.split())
        if not re.fullmatch(r"[A-Za-z][A-Za-z .'-]{1,99}", value):
            raise serializers.ValidationError(
                'Cardholder name may contain only letters, spaces, dots, apostrophes and hyphens.'
            )
        return value

    def validate_expiry_month(self, value):
        if not 1 <= value <= 12:
            raise serializers.ValidationError('Expiry month must be between 1 and 12.')
        return value

    def validate_expiry_year(self, value):
        this_year = timezone.localdate().year
        if not this_year <= value <= this_year + MAX_EXPIRY_YEARS_AHEAD:
            raise serializers.ValidationError(
                f'Expiry year must be between {this_year} and {this_year + MAX_EXPIRY_YEARS_AHEAD}.'
            )
        return value

    @sensitive_variables('attrs', 'number', 'cvv')
    def validate(self, attrs):
        today = timezone.localdate()
        if (attrs['expiry_year'], attrs['expiry_month']) < (today.year, today.month):
            raise serializers.ValidationError({'expiry_month': 'Card has expired.'})

        # Derive the safe fields, then discard the sensitive ones so they
        # can never reach the model or the database.
        number = attrs.pop('card_number')
        attrs.pop('cvv', None)
        attrs['card_type'] = detect_card_type(number)
        attrs['last4'] = number[-4:]
        attrs['masked_number'] = mask_last4(attrs['last4'])
        return attrs
