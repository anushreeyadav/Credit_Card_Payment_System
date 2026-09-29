from django.urls import path

from . import views

urlpatterns = [
    path('admin/summary/', views.SummaryView.as_view(), name='admin-summary'),
    path('admin/users/', views.UserListView.as_view(), name='admin-users'),
    path('admin/users/<int:pk>/', views.UserUpdateView.as_view(), name='admin-user-update'),
    path('admin/cards/', views.CardListView.as_view(), name='admin-cards'),
    path('admin/transactions/', views.TransactionListView.as_view(), name='admin-transactions'),
    path('admin/logs/', views.AdminLogListView.as_view(), name='admin-logs'),
    path('admin/logs/actions/', views.AdminLogActionsView.as_view(), name='admin-log-actions'),
]
