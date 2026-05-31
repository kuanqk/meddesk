from rest_framework import serializers


class SchedulerStateSerializer(serializers.Serializer):
    people = serializers.ListField(child=serializers.DictField(), allow_empty=True)
    schedule = serializers.DictField(child=serializers.DictField(), allow_empty=True)
    expenses = serializers.DictField()
    sel_id = serializers.CharField(required=False, allow_null=True, allow_blank=True)

    def validate_expenses(self, value):
        required = ("rent", "marketing", "materials", "other", "anesthesia_pct")
        for key in required:
            if key not in value:
                raise serializers.ValidationError(f"Missing expense field: {key}")
        return value
