import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getRooms,
  getRoomTypes,
  createRoom,
  updateRoom,
  deleteRoom,
  createRoomType,
  updateRoomType,
  deleteRoomType,
  getAvailableRooms,
} from "@/services/roomService";
import type { RoomInsert, RoomUpdate, RoomTypeInsert, RoomTypeUpdate } from "@/types/database.types";

export const roomKeys = {
  all: ["rooms"] as const,
  list: () => [...roomKeys.all, "list"] as const,
  types: () => ["room-types"] as const,
  available: (checkIn: string, checkOut: string, typeId?: string) =>
    ["rooms", "available", checkIn, checkOut, typeId] as const,
};

export function useRooms() {
  return useQuery({ queryKey: roomKeys.list(), queryFn: getRooms });
}

export function useRoomTypes() {
  return useQuery({ queryKey: roomKeys.types(), queryFn: getRoomTypes });
}

export function useAvailableRooms(
  checkIn: string,
  checkOut: string,
  roomTypeId?: string
) {
  return useQuery({
    queryKey: roomKeys.available(checkIn, checkOut, roomTypeId),
    queryFn: () => getAvailableRooms(checkIn, checkOut, roomTypeId),
    enabled: Boolean(checkIn && checkOut),
  });
}

export function useCreateRoom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: RoomInsert) => createRoom(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: roomKeys.list() }),
  });
}

export function useUpdateRoom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: RoomUpdate }) =>
      updateRoom(id, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: roomKeys.list() }),
  });
}

export function useDeleteRoom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteRoom(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: roomKeys.list() }),
  });
}

export function useCreateRoomType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: RoomTypeInsert) => createRoomType(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: roomKeys.types() }),
  });
}

export function useUpdateRoomType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: RoomTypeUpdate }) =>
      updateRoomType(id, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: roomKeys.types() }),
  });
}

export function useDeleteRoomType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteRoomType(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: roomKeys.types() }),
  });
}
