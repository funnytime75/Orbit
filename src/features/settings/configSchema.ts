import { z } from "zod";
import { normalizeShortcut } from "./shortcutRecorder";

const idSchema = z
  .string()
  .regex(/^[a-z0-9_-]+$/, "ID 只能包含小写字母、数字、短横线和下划线");

const iconSchema = z.object({
  type: z.literal("text"),
  value: z.string().min(1, "图标不能为空").max(4, "文本图标最多 4 个字符"),
});

const actionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("app"),
    program: z
      .string()
      .min(1, "应用程序不能为空")
      .refine((value) => value.trim().toLowerCase().endsWith(".exe"), "首版只支持 Windows .exe 应用"),
    args: z.array(z.string()),
  }),
  z.object({
    type: z.literal("file"),
    path: z.string().min(1, "文件路径不能为空"),
  }),
  z.object({
    type: z.literal("url"),
    url: z.string().url("URL 格式无效").refine((value) => {
      const protocol = new URL(value).protocol;
      return protocol === "http:" || protocol === "https:";
    }, "URL 只允许 http 或 https"),
  }),
  z.object({
    type: z.literal("hotkey"),
    keys: z.array(z.string().min(1, "按键不能为空")).min(1, "快捷键不能为空"),
  }),
  z.object({
    type: z.literal("command"),
    program: z.string().min(1, "命令程序不能为空"),
    args: z.array(z.string()),
    confirm: z.literal(true),
  }),
]);

const sectorSchema = z.object({
  id: idSchema,
  label: z.string().min(1, "扇区名称不能为空").max(32, "扇区名称最多 32 个字符"),
  icon: iconSchema,
  action: actionSchema,
});

const menuSchema = z.object({
  id: idSchema,
  label: z.string().min(1, "菜单名称不能为空").max(32, "菜单名称最多 32 个字符"),
  sectors: z
    .array(sectorSchema)
    .min(2, "每个菜单至少需要 2 个扇区")
    .max(12, "每个菜单最多支持 12 个扇区"),
});

const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, "颜色必须是 #RRGGBB 格式");
const supportedBackgroundImageExtensions = [".png", ".jpg", ".jpeg", ".webp", ".bmp"] as const;

const wheelAppearanceSchema = z.object({
  material: z.enum(["transparent", "acrylic", "frosted", "solid"]),
  opacity: z.number().min(0.35, "不透明度不能小于 0.35").max(1, "不透明度不能大于 1"),
  blurPx: z.number().int().min(0, "模糊强度不能小于 0").max(32, "模糊强度不能大于 32"),
  backgroundColor: hexColorSchema,
  borderColor: hexColorSchema,
  activeColor: hexColorSchema,
  background: z
    .object({
      type: z.enum(["none", "image"]),
      imagePath: z.string().nullable(),
      fit: z.enum(["cover", "contain"]),
      opacity: z.number().min(0, "背景图不透明度不能小于 0").max(0.6, "背景图不透明度不能大于 0.6"),
    })
    .superRefine((background, context) => {
      if (background.type === "image" && !background.imagePath?.trim()) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "图片背景路径不能为空",
          path: ["imagePath"],
        });
      }

      if (background.type === "image" && background.imagePath?.trim() && !hasSupportedBackgroundImageExtension(background.imagePath)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "图片背景只支持 png、jpg、jpeg、webp 或 bmp",
          path: ["imagePath"],
        });
      }
    }),
});

export const orbitConfigSchema = z
  .object({
    version: z.literal(1),
    enabled: z.boolean(),
    startup: z.object({
      launchAtLogin: z.boolean(),
      silentStart: z.boolean(),
    }),
    trigger: z.object({
      button: z.literal("middle"),
      shortcut: z
        .string()
        .min(1, "触发快捷键不能为空")
        .transform((value, context) => {
          const shortcut = normalizeShortcut(value);
          if (!shortcut) {
            context.addIssue({
              code: z.ZodIssueCode.custom,
              message: "请使用 Ctrl、Alt、Shift 或 Win 与另一个按键组合",
            });
            return z.NEVER;
          }
          return shortcut;
        }),
      holdMs: z.number().int().min(120, "长按时间不能小于 120ms").max(600, "长按时间不能大于 600ms"),
      moveThresholdPx: z.number().int().min(8, "移动阈值不能小于 8px").max(60, "移动阈值不能大于 60px"),
      cancelDistancePx: z.number().int().min(0, "取消距离不能小于 0px").max(120, "取消距离不能大于 120px"),
    }),
    wheel: z.object({
      sizePx: z.number().int().min(240, "轮盘尺寸不能小于 240px").max(720, "轮盘尺寸不能大于 720px"),
      innerRadiusPx: z.number().int().min(12, "内半径不能小于 12px"),
      outerRadiusPx: z.number().int().min(60, "外半径不能小于 60px"),
      startAngleDeg: z.number().min(-360, "起始角度不能小于 -360").max(360, "起始角度不能大于 360"),
      animationMs: z.number().int().min(0, "动画时间不能小于 0ms").max(500, "动画时间不能大于 500ms"),
      theme: z.enum(["system", "light", "dark"]),
      appearance: wheelAppearanceSchema,
    }),
    menus: z.array(menuSchema).min(1, "至少需要一个菜单"),
    uiState: z.object({
      lastAppPickerDir: z.string().optional().nullable(),
    }),
  })
  .superRefine((config, context) => {
    if (config.wheel.innerRadiusPx >= config.wheel.outerRadiusPx) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "轮盘内半径必须小于外半径",
        path: ["wheel", "innerRadiusPx"],
      });
    }
  });

export type OrbitConfig = z.infer<typeof orbitConfigSchema>;
export type OrbitAction = OrbitConfig["menus"][number]["sectors"][number]["action"];

export const defaultOrbitConfig: OrbitConfig = {
  version: 1,
  enabled: true,
  startup: {
    launchAtLogin: false,
    silentStart: false,
  },
  trigger: {
    button: "middle",
    shortcut: "Alt+Space",
    holdMs: 220,
    moveThresholdPx: 18,
    cancelDistancePx: 14,
  },
  wheel: {
    sizePx: 360,
    innerRadiusPx: 42,
    outerRadiusPx: 156,
    startAngleDeg: -90,
    animationMs: 90,
    theme: "system",
    appearance: {
      material: "acrylic",
      opacity: 0.9,
      blurPx: 18,
      backgroundColor: "#101827",
      borderColor: "#2b3d58",
      activeColor: "#2f6df6",
      background: {
        type: "none",
        imagePath: null,
        fit: "cover",
        opacity: 0.35,
      },
    },
  },
  menus: [
    {
      id: "main",
      label: "主菜单",
      sectors: [
        {
          id: "chrome",
          label: "Chrome",
          icon: {
            type: "text",
            value: "C",
          },
          action: {
            type: "app",
            program: "chrome.exe",
            args: [],
          },
        },
        {
          id: "vscode",
          label: "VS Code",
          icon: {
            type: "text",
            value: "V",
          },
          action: {
            type: "app",
            program: "Code.exe",
            args: [],
          },
        },
        {
          id: "notepad",
          label: "记事本",
          icon: {
            type: "text",
            value: "记",
          },
          action: {
            type: "app",
            program: "notepad.exe",
            args: [],
          },
        },
      ],
    },
  ],
  uiState: {
    lastAppPickerDir: "C:\\Program Files",
  },
};

export function validateOrbitConfig(config: unknown): OrbitConfig {
  return orbitConfigSchema.parse(config);
}

function hasSupportedBackgroundImageExtension(path: string): boolean {
  const normalizedPath = path.trim().toLowerCase();
  return supportedBackgroundImageExtensions.some((extension) => normalizedPath.endsWith(extension));
}
