from django.contrib import admin

from .models import DaySlot, HourSlot, Room, WeekTemplate


class HourSlotInline(admin.TabularInline):
    model = HourSlot
    extra = 0


@admin.register(Room)
class RoomAdmin(admin.ModelAdmin):
    list_display = ("number", "clinic", "is_active")
    list_filter = ("clinic", "is_active")


@admin.register(WeekTemplate)
class WeekTemplateAdmin(admin.ModelAdmin):
    list_display = ("name", "clinic", "year", "month", "week_number")
    list_filter = ("clinic", "year", "month")


@admin.register(DaySlot)
class DaySlotAdmin(admin.ModelAdmin):
    list_display = ("staff_member", "room", "date", "week_template")
    list_filter = ("date", "week_template")
    inlines = [HourSlotInline]


@admin.register(HourSlot)
class HourSlotAdmin(admin.ModelAdmin):
    list_display = ("day_slot", "hour")
