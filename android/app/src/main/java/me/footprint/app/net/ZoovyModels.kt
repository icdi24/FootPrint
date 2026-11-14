package me.footprint.app.net

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

/** POST /api/zoowy/chat 请求体；requestId 由客户端用 UUID 生成，服务端据此做幂等与「停止本轮」 */
@Serializable
data class ZoovyRequest(
    val message: String,
    val requestId: String,
    @SerialName("big_goal_id") val bigGoalId: Long? = null,
)

/** GET /api/zoowy/messages 里的一条历史消息 */
@Serializable
data class ZoovyMessage(
    val role: String,
    val content: String = "",
    val cards: List<ZoovyCard> = emptyList(),
    val tools: List<String>? = null,
    val profileChanges: List<String>? = null,
    val failed: Boolean? = null,
    val createdAt: String? = null,
    val report: ZoovyRunReport? = null,
)

@Serializable
data class ZoovyHistory(
    val sessionId: Long = 0,
    val messages: List<ZoovyMessage> = emptyList(),
)

/** POST /api/zoowy/chat 响应 */
@Serializable
data class ZoovyReply(
    val reply: String = "",
    val sessionId: Long = 0,
    val toolCalls: List<String> = emptyList(),
    val cards: List<ZoovyCard> = emptyList(),
    val failed: Boolean = false,
    val report: ZoovyRunReport? = null,
)

/** 提议确认等操作带 requestId 的请求体 */
@Serializable
data class ZoovyOperationRequest(val requestId: String, val revision: Int)

@Serializable
data class ZoovyCancellation(val cancelled: Boolean = false, val accepted: Boolean = false, val state: String = "")

@Serializable
data class ZoovyRunReport(
    val requestId: String = "", val state: String = "", val durationMs: Long = 0,
    val modelCalls: Int = 0, val totalTokens: Long = 0, val usageReported: Boolean = false,
    val tools: List<ZoovyToolReport> = emptyList(), val reason: String? = null,
    val committedChanges: List<ZoovyCommittedChange> = emptyList(),
)

@Serializable
data class ZoovyCommittedChange(val operation: String = "", val summary: String = "", val recordIds: List<Long> = emptyList())

@Serializable
data class ZoovyToolReport(val name: String = "", val status: String = "", val reason: String? = null)

@Serializable
data class ZoovyTurnStatus(
    val requestId: String = "", val state: String = "", val report: ZoovyRunReport? = null,
    val result: JsonElement? = null,
)

@Serializable
data class ZoovyCardResponse(val card: ZoovyCard)

/** POST /api/zoowy/drafts/{id}/confirm 的请求体 */
@Serializable
data class ZoovyConfirm(val revision: Int)

/** 聊天里的四种卡片：plan_offer / profile_offer / plan_draft / profile_applied */
@Serializable
data class ZoovyCard(
    val type: String,
    val id: Long? = null,
    val offerId: Long? = null,
    val summary: String? = null,
    val changeId: Long? = null,
    val draft: ZoovyDraft? = null,
    val modelWork: Boolean? = null,
    val revision: Int? = null,
    val preview: List<ZoovyPreview> = emptyList(),
)

@Serializable
data class ZoovyPreview(
    val label: String = "", val before: String = "", val after: String = "",
    val reason: String? = null, val evidence: String? = null,
)

@Serializable
data class ZoovyDraft(
    val id: Long,
    val revision: Int,
    val status: String,
    val goal: String,
    val question: String? = null,
    val weeklyMinutes: Int? = null,
    val deadline: String? = null,
    val steps: List<ZoovyStep> = emptyList(),
)

@Serializable
data class ZoovyStep(
    val title: String = "",
    val doneWhen: String = "",
    val next: Boolean = false,
)
