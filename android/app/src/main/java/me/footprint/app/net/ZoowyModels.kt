package me.footprint.app.net

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class ZoowyRequest(
    val message: String,
    val requestId: String,
    val attachmentId: Long? = null,
    @SerialName("big_goal_id") val bigGoalId: Long? = null,
    val deepThinking: Boolean = false,
    val smartSearch: Boolean = false,
)

@Serializable
data class ZoowyMessage(
    val role: String,
    val content: String = "",
    val cards: List<ZoowyCard> = emptyList(),
    val attachmentId: Long? = null,
    val sources: List<ZoowySource> = emptyList(),
)

@Serializable
data class ZoowyHistory(val messages: List<ZoowyMessage> = emptyList())

@Serializable
data class ZoowyReply(
    val reply: String = "",
    val cards: List<ZoowyCard> = emptyList(),
    val sources: List<ZoowySource> = emptyList(),
)

@Serializable
data class ZoowyOperationRequest(val requestId: String)

@Serializable
data class ZoowyCompact(val summarizedMessages: Int = 0, val throughMessageId: Long? = null)

@Serializable
data class ZoowyCompactReply(val reply: String = "", val compact: ZoowyCompact? = null)

@Serializable
data class ZoowyCancellation(val cancelled: Boolean = false)

@Serializable
data class ZoowySource(val url: String, val title: String = "", val snippet: String = "")

@Serializable
data class ZoowyCard(
    val type: String,
    val id: Long? = null,
    val offerId: Long? = null,
    val summary: String? = null,
    val label: String? = null,
    val draft: ZoowyDraft? = null,
    val modelWork: Boolean? = null,
)

@Serializable
data class ZoowyDraft(
    val id: Long,
    val revision: Int,
    val status: String,
    val goal: String,
    val question: String? = null,
    val weeklyMinutes: Int? = null,
    val deadline: String? = null,
    val steps: List<ZoowyStep> = emptyList(),
)

@Serializable
data class ZoowyStep(val title: String, val doneWhen: String, val next: Boolean = false)

@Serializable
data class ZoowyCardResponse(val card: ZoowyCard)

@Serializable
data class ZoowyConfirm(val revision: Int)

@Serializable
data class ZoowyModel(val configured: Boolean = false, val model: String = "deepseek-flash")

@Serializable
data class ZoowyModelRequest(val apiKey: String, val model: String)

@Serializable
data class ZoowyImage(val dataUrl: String)

@Serializable
data class ZoowyAttachment(val attachmentId: Long)
