import json
import os
from datetime import datetime, timedelta

DATA_FILE = "projects_data.json"

# ---------- 默认数据 ----------
DEFAULT_PROJECTS = [
    {
        "id": "MAIN_1",
        "name": "主项目一：电商系统重构与升级",
        "type": "main",
        "owner": "张伟 (TL)",
        "description": "对现有单体电商平台进行微服务拆分。",
        "children": [
            {
                "id": "SUB_101",
                "name": "需求分析与原型设计",
                "type": "sub",
                "owner": "张伟",
                "start": "2026-07-01",
                "end": "2026-07-20",
                "actual_end": "2026-07-15",
                "man_days": 15,
                "description": "绘制新版高保真原型图。"
            },
            {
                "id": "SUB_102",
                "name": "前端 UI 核心组件库搭建",
                "type": "sub",
                "owner": "张伟",
                "start": "2026-07-21",
                "end": "2026-08-10",
                "actual_end": "2026-08-15",
                "man_days": 18,
                "description": "基于 Tailwind CSS 封装通用 Gantt 看板。"
            },
            {
                "id": "SUB_103",
                "name": "后端微服务 API 开发",
                "type": "sub",
                "owner": "李娜",
                "start": "2026-08-01",
                "end": "2026-09-30",
                "actual_end": None,
                "man_days": 40,
                "description": "完成 RESTful 接口开发。"
            }
        ],
        "events": [
            {"id": "EVT_101", "name": "架构选型评审", "type": "meeting", "owner": "全员", "date": "2026-07-15", "description": "架构评审"},
            {"id": "EVT_102", "name": "Mid-Term Demo", "type": "milestone", "owner": "张伟", "date": "2026-08-20", "description": "阶段成果汇报"}
        ]
    }
]

# ---------- 全局内存数据 ----------
projects_db = []

def load_data():
    """加载数据：优先从JSON文件读取，否则使用默认数据并保存"""
    global projects_db
    if os.path.exists(DATA_FILE):
        try:
            with open(DATA_FILE, 'r', encoding='utf-8') as f:
                projects_db = json.load(f)
            print(f"✅ 从 {DATA_FILE} 加载数据成功")
        except Exception as e:
            print(f"⚠️ 加载 {DATA_FILE} 失败: {e}，使用默认数据")
            projects_db = DEFAULT_PROJECTS.copy()
            save_data()
    else:
        projects_db = DEFAULT_PROJECTS.copy()
        save_data()
        print(f"📁 创建默认数据文件 {DATA_FILE}")

def save_data():
    """将当前内存数据写入JSON文件"""
    try:
        with open(DATA_FILE, 'w', encoding='utf-8') as f:
            json.dump(projects_db, f, ensure_ascii=False, indent=2)
        return True
    except Exception as e:
        print(f"❌ 保存数据失败: {e}")
        return False

# ---------- 工具函数（不变） ----------
def calculate_days(start_str, end_str):
    if not start_str or not end_str:
        return 0, 0
    d_start = datetime.strptime(start_str, "%Y-%m-%d").date()
    d_end = datetime.strptime(end_str, "%Y-%m-%d").date()
    if d_start > d_end:
        return 0, 0
    calendar_days = (d_end - d_start).days + 1
    work_days = 0
    curr = d_start
    while curr <= d_end:
        if curr.weekday() < 5:
            work_days += 1
        curr += timedelta(days=1)
    return calendar_days, work_days

def calculate_auto_progress(start_str, end_str, actual_end_str, today_str="2026-08-12"):
    if not start_str or not end_str:
        return 0
    d_start = datetime.strptime(start_str, "%Y-%m-%d").date()
    d_end = datetime.strptime(end_str, "%Y-%m-%d").date()
    d_today = datetime.strptime(today_str, "%Y-%m-%d").date()

    if actual_end_str:
        d_actual = datetime.strptime(actual_end_str, "%Y-%m-%d").date()
        if d_today >= d_actual:
            return 100
        total_days = (d_actual - d_start).days
        if total_days <= 0:
            return 0
        passed_days = (d_today - d_start).days
        progress = round((passed_days / total_days) * 100)
        return min(max(progress, 0), 100)
    else:
        if d_today <= d_start:
            return 0
        total_days = (d_end - d_start).days
        if total_days <= 0:
            return 100
        passed_days = (d_today - d_start).days
        progress = round((passed_days / total_days) * 100)
        return min(max(progress, 0), 100)

def process_projects(projects, today="2026-08-12"):
    for main in projects:
        main_cal = 0
        main_work = 0
        for child in main["children"]:
            c_days, w_days = calculate_days(child["start"], child["end"])
            child["calendar_days"] = c_days
            child["work_days"] = w_days
            child["progress"] = calculate_auto_progress(child["start"], child["end"], child.get("actual_end"), today)
            main_cal += c_days
            main_work += w_days

        all_starts = [c["start"] for c in main["children"]] + [e["date"] for e in main["events"]]
        all_ends = [c["end"] for c in main["children"]] + [e["date"] for e in main["events"]]
        if all_starts and all_ends:
            main["start"] = min(all_starts)
            main["end"] = max(all_ends)
            main["man_days"] = sum(c.get("man_days", 0) for c in main["children"])
            main["calendar_days"] = main_cal
            main["work_days"] = main_work
        else:
            main["start"] = "2026-06-01"
            main["end"] = "2026-12-31"
            main["man_days"] = 0
            main["calendar_days"] = 0
            main["work_days"] = 0
    return projects

# ---------- CRUD 操作（自动持久化） ----------
def get_all_projects(today="2026-08-12"):
    # 每次获取时处理派生字段（不修改原始数据，仅用于返回）
    # 但为了保持数据一致性，我们在内存数据上处理，但不要改变原始数据中的派生字段
    # 这里复制一份再处理
    import copy
    data_copy = copy.deepcopy(projects_db)
    return process_projects(data_copy, today)

def find_main_by_id(main_id):
    return next((p for p in projects_db if p["id"] == main_id), None)

def add_node(main_id, node_data):
    main = find_main_by_id(main_id)
    if not main:
        return False
    node_type = node_data.get("type")
    if node_type in ("meeting", "milestone"):
        new_event = {
            "id": f"EVT_{datetime.now().strftime('%M%S')}",
            "name": node_data["name"],
            "type": node_type,
            "owner": node_data["owner"],
            "date": node_data["start"],
            "description": node_data.get("description", "")
        }
        main["events"].append(new_event)
    else:
        new_child = {
            "id": f"SUB_{datetime.now().strftime('%M%S')}",
            "name": node_data["name"],
            "type": "sub",
            "owner": node_data["owner"],
            "start": node_data["start"],
            "end": node_data["end"],
            "actual_end": node_data.get("actual_end"),
            "man_days": float(node_data.get("man_days", 1)),
            "description": node_data.get("description", "")
        }
        main["children"].append(new_child)
    return save_data()  # 保存到文件

def update_node(node_id, updates):
    for main in projects_db:
        if main["id"] == node_id:
            main["name"] = updates.get("name", main["name"])
            main["owner"] = updates.get("owner", main["owner"])
            main["description"] = updates.get("description", main.get("description", ""))
            return save_data()
        for child in main["children"]:
            if child["id"] == node_id:
                child["name"] = updates.get("name", child["name"])
                child["owner"] = updates.get("owner", child["owner"])
                child["start"] = updates.get("start", child["start"])
                child["end"] = updates.get("end", child["end"])
                child["actual_end"] = updates.get("actual_end")
                child["man_days"] = float(updates.get("man_days", child["man_days"]))
                child["description"] = updates.get("description", child.get("description", ""))
                return save_data()
        for evt in main["events"]:
            if evt["id"] == node_id:
                evt["name"] = updates.get("name", evt["name"])
                evt["owner"] = updates.get("owner", evt["owner"])
                evt["date"] = updates.get("date", evt["date"])
                evt["description"] = updates.get("description", evt.get("description", ""))
                return save_data()
    return False


def add_project(project_data):
    """新增一个主项目，自动生成 ID，并保存到文件"""
    new_id = f"MAIN_{len(projects_db) + 1}"
    new_project = {
        "id": new_id,
        "name": project_data["name"],
        "type": "main",
        "owner": project_data.get("owner", ""),
        "description": project_data.get("description", ""),
        "children": [],
        "events": []
    }
    projects_db.append(new_project)
    save_data()
    return new_id

def delete_project(project_id):
    """删除整个主项目（及其所有子任务和事件）"""
    for i, main in enumerate(projects_db):
        if main["id"] == project_id:
            del projects_db[i]
            save_data()
            return True
    return False

def delete_node(node_id):
    """删除任意节点（子任务、沟通会、里程碑）"""
    for main in projects_db:
        # 删除子任务
        for i, child in enumerate(main.get("children", [])):
            if child["id"] == node_id:
                del main["children"][i]
                save_data()
                return True
        # 删除事件
        for i, evt in enumerate(main.get("events", [])):
            if evt["id"] == node_id:
                del main["events"][i]
                save_data()
                return True
    return False

# ---------- 加载数据（模块导入时自动执行） ----------
load_data()