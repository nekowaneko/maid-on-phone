package com.accompany.pet.core.todoist

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class TodoistModelsTest {

    @Test
    fun testIsValidTaskId() {
        assertTrue(isValidTaskId("A01"))
        assertTrue(isValidTaskId("task_123"))
        assertFalse(isValidTaskId("A-01"))
        assertFalse(isValidTaskId(""))
        assertFalse(isValidTaskId(null))
    }

    @Test
    fun testPickTodoistPayload() {
        val payload = """{"view":"p2","taskId":"A01"}"""
        assertEquals(payload, pickTodoistPayload(payload))
        assertEquals(payload, pickTodoistPayload("  $payload  "))
        assertNull(pickTodoistPayload("not json"))
        assertNull(pickTodoistPayload(null))
    }

    @Test
    fun testIsSendableTodoistAction() {
        assertTrue(isSendableTodoistAction("doToday"))
        assertTrue(isSendableTodoistAction("snooze"))
        assertFalse(isSendableTodoistAction("cancel"))
        assertFalse(isSendableTodoistAction(null))
    }
}

