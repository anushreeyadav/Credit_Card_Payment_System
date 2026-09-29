from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator, RegexValidator
from django.db import models


class Card(models.Model):
    """A saved card.

    Only non-sensitive card details are stored. The full card number and the
    CVV are never persisted; see CardSerializer for how they are discarded.
    """

    class CardType(models.TextChoices):
        VISA = 'visa', 'Visa'
        MASTERCARD = 'mastercard', 'Mastercard'
        AMEX = 'amex', 'American Express'
        DISCOVER = 'discover', 'Discover'
        RUPAY = 'rupay', 'RuPay'

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='cards',
    )
    cardholder_name = models.CharField(max_length=100)
    masked_number = models.CharField(max_length=19)
    last4 = models.CharField(
        max_length=4,
        validators=[RegexValidator(r'^\d{4}$', 'last4 must be exactly 4 digits.')],
    )
    card_type = models.CharField(max_length=20, choices=CardType.choices)
    expiry_month = models.PositiveSmallIntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(12)],
    )
    expiry_year = models.PositiveSmallIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at', '-id']
        constraints = [
            models.CheckConstraint(
                condition=models.Q(expiry_month__gte=1, expiry_month__lte=12),
                name='card_expiry_month_range',
            ),
        ]

    def __str__(self):
        return f'{self.get_card_type_display()} {self.masked_number}'
