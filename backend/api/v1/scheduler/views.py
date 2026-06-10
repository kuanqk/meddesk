from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import require_tab
from apps.schedule.services import load_scheduler_state, save_scheduler_state

from .serializers import SchedulerStateSerializer


class SchedulerStateView(APIView):
    permission_classes = [require_tab("schedule")]

    def get(self, request):
        data = load_scheduler_state()
        if data is None:
            return Response(None, status=status.HTTP_204_NO_CONTENT)
        return Response(data)

    def put(self, request):
        serializer = SchedulerStateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        save_scheduler_state(serializer.validated_data)
        return Response(serializer.validated_data)
