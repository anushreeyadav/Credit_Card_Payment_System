from django.conf import settings
from django.db import models


class Payment(models.Model):
    """A simulated payment.

    Django owns this table's schema (migrations); the FastAPI payment service
    creates and processes the rows. No full card number or CVV is ever stored:
    the card is referenced by id, with its last 4 digits and type copied at
    payment time so history survives the card being deleted.
    """

    class Status(models.TextChoices):
        PENDING = 'PENDING', 'Pending'
        SUCCESS = 'SUCCESS', 'Success'
        FAILED = 'FAILED', 'Failed'

    reference = models.CharField(max_length=40, unique=True)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='payments',
    )
    card = models.ForeignKey(
        'cards.Card',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='payments',
    )
    card_last4 = models.CharField(max_length=4)
    card_type = models.CharField(max_length=20)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    currency = models.CharField(max_length=3, default='INR')
    description = models.CharField(max_length=255, blank=True, default='')
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    failure_reason = models.CharField(max_length=255, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'transaction'
        verbose_name_plural = 'transactions'
        ordering = ['-created_at', '-id']
        indexes = [models.Index(fields=['user', '-created_at'], name='payment_user_created_idx')]
        constraints = [
            models.CheckConstraint(condition=models.Q(amount__gt=0), name='payment_amount_positive'),
            models.CheckConstraint(
                condition=models.Q(status__in=['PENDING', 'SUCCESS', 'FAILED']),
                name='payment_status_valid',
            ),
        ]

    def __str__(self):
        return f'{self.reference} {self.amount} {self.currency} {self.status}'
