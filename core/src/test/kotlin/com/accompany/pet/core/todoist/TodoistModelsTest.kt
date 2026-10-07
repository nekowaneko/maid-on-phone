package com.accompany.pet.core.todoist

import org.junit.Test
import org.junit.Assert.*

class TodoistModelsTest {

    @Test
    fun testIsValidTodoistAction() {
        assertTrue(isValidTodoistAction(TODOIST_ACTION_SNOOZE))
        assertTrue(isValidTodoistAction(TODOIST_ACTION_DO_TODAY))
        assertTrue(isValidTodoistAction(TODOIST_ACTION_SPLIT))
        assertTrue(isValidTodoistAction(TODOIST_ACTION_ASK_DATE))
        assertFalse(isValidTodoistAction("invalid_action"))
    }

    @Test
    fun testBuildTodoistActionJson() {
        val json = buildTodoistActionJson("snooze", "task123")
        assertEquals("""{"action":"snooze","taskId":"task123"}""", json)
    }
}
