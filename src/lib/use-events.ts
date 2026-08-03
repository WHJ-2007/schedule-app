"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ScheduleEvent,
  EventInput,
  updateEventInList,
  deleteEventFromList,
  toggleEventDone,
  loadEvents,
  saveEvents,
  createId,
} from "./events";

export function useEvents() {
  const [events, setEvents] = useState<ScheduleEvent[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setEvents(loadEvents());
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (loaded) {
      saveEvents(events);
    }
  }, [events, loaded]);

  const addEvent = useCallback((input: EventInput): ScheduleEvent => {
    const event: ScheduleEvent = {
      id: createId(),
      title: input.title.trim(),
      date: input.date,
      time: input.time ?? "",
      description: input.description ?? "",
      done: false,
    };
    setEvents((prev) => [...prev, event]);
    return event;
  }, []);

  const updateEvent = useCallback((id: string, patch: Partial<Omit<ScheduleEvent, "id">>) => {
    setEvents((prev) => updateEventInList(prev, id, patch));
  }, []);

  const deleteEvent = useCallback((id: string) => {
    setEvents((prev) => deleteEventFromList(prev, id));
  }, []);

  const toggleDone = useCallback((id: string) => {
    setEvents((prev) => toggleEventDone(prev, id));
  }, []);

  return { events, addEvent, updateEvent, deleteEvent, toggleDone };
}
