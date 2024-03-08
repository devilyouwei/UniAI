/** @format */

import { ChatCompletionContentPartImage } from 'openai/resources'
import {
    EmbedModel,
    ChatModel,
    ChatRoleEnum,
    ModelProvider,
    ImagineModel,
    ChatModelProvider,
    ImagineModelProvider,
    ImgTaskType,
    ModelModel
} from './Enum'

export interface ChatMessage {
    role: ChatRoleEnum
    content: string
    img?: ChatCompletionContentPartImage.ImageURL
}

export interface EmbeddingResponse {
    embedding: number[][]
    dimension: number
    model: EmbedModel
    object: 'embedding'
    promptTokens: number
    totalTokens: number
}

export interface ChatResponse {
    content: string
    promptTokens: number
    completionTokens: number
    totalTokens: number
    model: ChatModel | string
    object: string
}

export interface ChatOption {
    stream?: boolean
    provider?: ChatModelProvider
    model?: ChatModel
    top?: number
    temperature?: number
    maxLength?: number
}

export interface EmbedOption {
    provider?: ModelProvider
    model?: EmbedModel
}

export type ModelList = Provider[]

export interface Provider {
    provider: keyof typeof ModelProvider
    value: ModelProvider
    models: ModelModel[]
}

export interface ImagineOption {
    provider?: ImagineModelProvider
    model?: ImagineModel
    negativePrompt?: string
    height?: number
    width?: number
    num?: number
}

export interface ImagineResponse {
    taskId: string
    time: number
}

export interface TaskResponse {
    id: string
    type: ImgTaskType
    imgs: string[]
    info: string
    fail: string
    progress: number
    created: number
    model: ImagineModel
}
