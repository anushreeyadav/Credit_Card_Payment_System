"""Admin dashboard serializers.

Explicit field lists only: no password/hash, no tokens, no full card number
or CVV (neither is stored), no secrets.
"""

from django.contrib.auth import get_user_model
from rest_framework import serializers

from adminlogs.models import AdminLog
from cards.models import Card
from payments.models import Payment

User = get_user_model()


class AdminUserSerializer(serializers.ModelSerializer):
    card_count = serializers.IntegerField(read_only=True)
    payment_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = User
        fields = [
            'id', 'username', 'email', 'first_name', 'last_name', 'is_active', 'is_staff', 'is_superuser',
            'date_joined', 'last_login', 'card_count', 'payment_count',
        ]
        read_only_fields = fields


class AdminUserUpdateSerializer(serializers.ModelSerializer):
    """Only account activation can be changed from the dashboard."""

    class Meta:
        model = User
        fields = ['is_active']


class AdminCardSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source='user.username', read_only=True)

    class Meta:
        model = Card
        fields = [
            'id', 'username', 'card_type', 'masked_number', 'last4', 'cardholder_name',
            'expiry_month', 'expiry_year', 'created_at',
        ]
        read_only_fields = fields


class AdminTransactionSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source='user.username', read_only=True)
    masked_card = serializers.SerializerMethodField()

    class Meta:
        model = Payment
        fields = [
            'reference', 'username', 'status', 'failure_reason', 'amount', 'currency', 'description',
            'card_type', 'masked_card', 'created_at', 'updated_at',
        ]
        read_only_fields = fields

    def get_masked_card(self, obj) -> str:
        return f'**** **** **** {obj.card_last4}'


class AdminLogSerializer(serializers.ModelSerializer):
    action_label = serializers.CharField(source='get_action_display', read_only=True)

    class Meta:
        model = AdminLog
        # metadata was scrubbed when the entry was recorded (adminlogs/sanitize.py).
        fields = [
            'id', 'created_at', 'username', 'action', 'action_label', 'object_type', 'object_id',
            'object_repr', 'ip_address', 'metadata',
        ]
        read_only_fields = fields


# --- Documentation-only serializers (describe responses built by hand) ---

class SuccessfulAmountSerializer(serializers.Serializer):
    currency = serializers.CharField()
    count = serializers.IntegerField()
    total_amount = serializers.DecimalField(max_digits=14, decimal_places=2)
    average_amount = serializers.DecimalField(max_digits=14, decimal_places=2)


class DayCountsSerializer(serializers.Serializer):
    date = serializers.DateField()
    total = serializers.IntegerField()
    success = serializers.IntegerField()
    failed = serializers.IntegerField()
    pending = serializers.IntegerField()


class AdminSummarySerializer(serializers.Serializer):
    date = serializers.DateField()
    time_zone = serializers.CharField()
    total = serializers.IntegerField(help_text='All payments created on this day.')
    success = serializers.IntegerField()
    failed = serializers.IntegerField()
    pending = serializers.IntegerField()
    success_rate = serializers.FloatField(allow_null=True, help_text='% of completed (non-pending) payments. Null if none.')
    successful_amounts = SuccessfulAmountSerializer(many=True, help_text='Totals per currency; never summed across currencies.')
    last_7_days = DayCountsSerializer(many=True, help_text='This day and the 6 before it, newest first.')


class ActionChoiceSerializer(serializers.Serializer):
    value = serializers.CharField()
    label = serializers.CharField()
