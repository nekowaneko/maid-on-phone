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
fun reduce(state: PetState, event: PetEvent): PetState = when (event) {
    PetEvent.START -> PetState(ServiceState.RUNNING, RenderState.PLAYING, true)
    PetEvent.STOP -> INITIAL_STATE  // 服務結束、通知移除
    PetEvent.SCREEN_OFF -> state.copy(render = RenderState.PAUSED)  // 只暫停渲染，取樣不停（S14 優先）
    PetEvent.SCREEN_ON ->
        if (state.service == ServiceState.RUNNING) state.copy(render = RenderState.PLAYING) else state  // 沒在跑就不播放
}
