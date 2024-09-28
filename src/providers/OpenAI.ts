/**
 * Utility for connecting to the OpenAI model API.
 *
 * @format prettier
 * @author devilyouwei
 */
import { PassThrough, Readable } from 'stream'
import EventSourceStream from '@server-sent-stream/node'
import { decodeStream } from 'iconv-lite'

import {
    GPTChatRequest,
    GPTChatResponse,
    GPTChatStreamRequest,
    GPTImagineSize,
    GPTChatStreamResponse,
    GPTChatMessage,
    OpenAIEmbedRequest,
    OpenAIEmbedResponse,
    OpenAIImagineRequest,
    OpenAIImagineResponse
} from '../../interface/IOpenAI'

import { ChatRoleEnum, DETaskType, OpenAIChatModel, OpenAIEmbedModel, OpenAIImagineModel } from '../../interface/Enum'

import { ChatResponse, ChatMessage, TaskResponse, ImagineResponse } from '../../interface/IModel'
import { EmbeddingResponse } from '../../interface/IModel'
import $ from '../util'

const STORAGE_KEY = 'task_open_ai'
const API = 'https://api.openai.com'
const VER = 'v1'

export default class OpenAI {
    private api: string
    private key?: string | string[]

    /**
     * Constructor for the OpenAI class.
     *
     * @param key - The API key for OpenAI.
     * @param api - The API endpoint for proxy (optional).
     */
    constructor(key?: string | string[], api: string = API) {
        this.key = key
        this.api = api
    }

    /**
     * Fetches embeddings for input text.
     *
     * @param input - An array of input strings.
     * @param model - The model to use for embeddings (default: text-embedding-ada-002).
     * @returns A promise resolving to the embedding response.
     */
    async embedding(input: string[], model: OpenAIEmbedModel = OpenAIEmbedModel.ADA) {
        const key = Array.isArray(this.key) ? $.getRandomKey(this.key) : this.key
        if (!key) throw new Error('OpenAI API key is not set in config')

        const res = await $.post<OpenAIEmbedRequest, OpenAIEmbedResponse>(
            `${this.api}/${VER}/embeddings`,
            { model, input },
            { headers: { Authorization: `Bearer ${key}` }, responseType: 'json' }
        )

        const data: EmbeddingResponse = {
            embedding: res.data.map(v => v.embedding),
            object: 'embedding',
            model,
            promptTokens: res.usage.prompt_tokens || 0,
            totalTokens: res.usage.total_tokens || 0
        }
        return data
    }

    /**
     * Sends messages to the GPT chat model.
     *
     * @param messages - An array of chat messages.
     * @param model - The model to use for chat (default: gpt-3.5-turbo).
     * @param stream - Whether to use stream response (default: false).
     * @param top - Top probability to sample (optional).
     * @param temperature - Temperature for sampling (optional).
     * @param maxLength - Maximum token length for response (optional).
     * @returns A promise resolving to the chat response or a stream.
     */
    async chat(
        messages: ChatMessage[],
        model: OpenAIChatModel = OpenAIChatModel.GPT3,
        stream: boolean = false,
        top?: number,
        temperature?: number,
        maxLength?: number
    ) {
        if (!Object.values(OpenAIChatModel).includes(model)) throw new Error('OpenAI chat model not found')

        const key = Array.isArray(this.key) ? $.getRandomKey(this.key) : this.key
        if (!key) throw new Error('OpenAI API key is not set in config')

        // remove imgs for not vision model
        if (
            ![
                OpenAIChatModel.GPT4_TURBO,
                OpenAIChatModel.GPT_4O,
                OpenAIChatModel.GPT_4O_MINI,
                OpenAIChatModel.CHAT_GPT_4O
            ].includes(model)
        )
            messages = messages.map(({ role, content }) => ({ role, content }))

        // temperature is float in [0,1]
        if (typeof temperature === 'number') {
            if (temperature < 0) temperature = 0
            if (temperature > 1) temperature = 1
        }
        // top is float in [0,1]
        if (typeof top === 'number') {
            if (top < 0) top = 0
            if (top > 1) top = 1
        }

        const res = await $.post<GPTChatRequest | GPTChatStreamRequest, Readable | GPTChatResponse>(
            `${this.api}/${VER}/chat/completions`,
            { model, messages: this.formatMessage(messages), stream, temperature, top_p: top, max_tokens: maxLength },
            { headers: { Authorization: `Bearer ${key}` }, responseType: stream ? 'stream' : 'json' }
        )

        const data: ChatResponse = {
            content: '',
            model,
            object: '',
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0
        }

        if (res instanceof Readable) {
            const output = new PassThrough()
            const parser = new EventSourceStream()
            parser.on('data', (e: MessageEvent) => {
                const obj = $.json<GPTChatStreamResponse>(e.data)
                if (obj?.choices[0].delta?.content) {
                    data.content = obj.choices[0].delta.content
                    data.model = obj.model
                    data.object = obj.object
                    output.write(JSON.stringify(data))
                }
            })

            parser.on('error', e => output.destroy(e))
            parser.on('end', () => output.end())

            res.pipe(decodeStream('utf-8')).pipe(parser)
            return output as Readable
        } else {
            data.content = res.choices[0].message.content || ''
            data.model = res.model
            data.object = res.object
            data.promptTokens = res.usage?.prompt_tokens || 0
            data.completionTokens = res.usage?.completion_tokens || 0
            data.totalTokens = res.usage?.total_tokens || 0
            return data
        }
    }

    /**
     * Generates images based on a prompt.
     *
     * @param prompt - The prompt for image generation.
     * @param width - Image width (default: 1024).
     * @param height - Image height (default: 1024).
     * @param n - Number of images to generate (default: 1).
     * @param model - Model choice (default: dall-e-3).
     * @returns A promise resolving to the image generation response.
     */
    async imagine(
        prompt: string,
        width: number = 1024,
        height: number = 1024,
        n: number = 1,
        model: OpenAIImagineModel = OpenAIImagineModel.DALL_E_3
    ): Promise<ImagineResponse> {
        const key = Array.isArray(this.key) ? $.getRandomKey(this.key) : this.key
        if (!key) throw new Error('OpenAI API key is not set in config')

        const res = await $.post<OpenAIImagineRequest, OpenAIImagineResponse>(
            `${this.api}/${VER}/images/${DETaskType.GENERATION}`,
            { model, prompt, n, size: `${width}x${height}` as GPTImagineSize, response_format: 'b64_json' },
            { headers: { Authorization: `Bearer ${key}` }, responseType: 'json' }
        )

        const id = $.getRandomId()
        const imgs: string[] = []
        for (const i in res.data) imgs.push(await $.writeFile(res.data[i].b64_json!, `${id}-${i}.png`))

        const time = Date.now()
        const task: TaskResponse = {
            id,
            type: DETaskType.GENERATION,
            info: 'success',
            progress: 100,
            imgs,
            fail: '',
            created: time,
            model
        }

        const tasks: TaskResponse[] = $.getItem(STORAGE_KEY) || []
        tasks.push(task)
        $.setItem(STORAGE_KEY, tasks)
        return { taskId: task.id, time }
    }

    /**
     * Simulate tasks.
     *
     * @param id - The task ID to retrieve (optional).
     * @returns An array of task responses or a specific task by ID.
     */
    task(id?: string) {
        const tasks: TaskResponse[] = $.getItem(STORAGE_KEY) || []

        if (id) return tasks.filter(v => v.id === id)
        else return tasks
    }

    /**
     * Formats chat messages according to the GPT model's message format.
     *
     * @param messages - An array of chat messages.
     * @returns Formatted messages compatible with the GPT model.
     */
    private formatMessage(messages: ChatMessage[]) {
        const prompt: GPTChatMessage[] = []

        for (const { role, content, img } of messages) {
            // GPT not support function role
            if (role === ChatRoleEnum.FUNCTION) continue

            // with image
            if (img) {
                if (!img.startsWith('http')) throw new Error('Invalid img HTTP URL')
                prompt.push({
                    role: 'user',
                    content: [
                        { type: 'text', text: content },
                        { type: 'image_url', image_url: { url: img } }
                    ]
                })
            }
            // only text
            else prompt.push({ role, content })
        }

        return prompt
    }
}
