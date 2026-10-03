package com.accompany.pet.core

// 服務狀態
enum class ServiceState { STOPPED, RUNNING }

// 動畫狀態
enum class RenderState { PLAYING, PAUSED }

// 會改變狀態的事件
enum class PetEvent { START, STOP, SCREEN_OFF, SCREEN_ON }

// 角色整體狀態
data class PetState(val service: ServiceState, val render: RenderState, val notificationShown: Boolean)

val INITIAL_STATE = PetState(ServiceState.STOPPED, RenderState.PAUSED, false)  // App 剛啟動時的狀態

// 依事件算出下一個狀態
fun reduce(state: PetState, event: PetEvent): PetState = TODO()
