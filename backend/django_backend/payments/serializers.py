from rest_framework import serializers

from .models import Payment

AMOUNT_FIELD = {'max_digits': 12, 'decimal_places': 2, 'min_value': 0}


class TransactionSerializer(serializers.ModelSerializer):
    """A payment as shown in transaction history. Masked card data only."""

    masked_card = serializers.SerializerMethodField()

    class Meta:
        model = Payment
        fields = [
            'reference',
            'status',
            'failure_reason',
            'amount',
            'currency',
            'description',
            'card_id',
            'card_type',
            'masked_card',
            'created_at',
            'updated_at',
        ]
        read_only_fields = fields

    def get_masked_card(self, obj) -> str:
        return f'**** **** **** {obj.card_last4}'


class TransactionFilterSerializer(serializers.Serializer):
    """Validates the query parameters of GET /api/transactions/."""

    status = serializers.CharField(required=False)
    min_amount = serializers.DecimalField(required=False, **AMOUNT_FIELD)
    max_amount = serializers.DecimalField(required=False, **AMOUNT_FIELD)
    date_from = serializers.DateField(required=False, input_formats=['%Y-%m-%d'])
    date_to = serializers.DateField(required=False, input_formats=['%Y-%m-%d'])

    def validate_status(self, value):
        value = value.strip().upper()
        if value not in Payment.Status.values:
            raise serializers.ValidationError(
                f'Must be one of: {", ".join(Payment.Status.values)}.'
            )
        return value

    def validate(self, attrs):
        min_amount, max_amount = attrs.get('min_amount'), attrs.get('max_amount')
        if min_amount is not None and max_amount is not None and min_amount > max_amount:
            raise serializers.ValidationError({'min_amount': 'Must not be greater than max_amount.'})
        date_from, date_to = attrs.get('date_from'), attrs.get('date_to')
        if date_from and date_to and date_from > date_to:
            raise serializers.ValidationError({'date_from': 'Must not be after date_to.'})
        return attrs
