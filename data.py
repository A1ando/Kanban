import sqlite3
import json
import os
import uuid
import time
import random
from datetime import datetime, timedelta
from contextlib import contextmanager

DB_FILE = os.environ.get('DB_PATH', 'projects.db')

# ---------- 工具函数 ----------
def generate_id(prefix):
    """生成唯一ID：前缀 + 时间戳微秒 + 随机数"""
    timestamp = int(time.time() * 1000)
    rand = random.randint(100, 999)
    return f"{prefix}_{timestamp}_{rand}"

def validate_date(date_str):
    """校验日期格式 YYYY-MM-DD，返回bool"""
    if not date_str:
        return True
    try:
        datetime.strptime(date_str, "%Y-%m-%d")
        return True
    except ValueError:
        return False

# ---------- 数据库连接 ----------
def get_db():
    conn = sqlite3.connect(DB_FILE, timeout=10, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode=WAL")
    return conn

@contextmanager
def db_cursor():
    conn = get_db()
    try:
        yield conn.cursor()
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

# ---------- 初始化表 ----------
def init_db():
    with db_cursor() as cur:
        # 主项目表
        cur.execute('''
            CREATE TABLE IF NOT EXISTS main_projects (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                type TEXT DEFAULT 'main',
                owner TEXT,
                description TEXT,
                start_date TEXT,
                end_date TEXT,
                man_days REAL DEFAULT 0,
                calendar_days INTEGER DEFAULT 0,
                work_days INTEGER DEFAULT 0,
                sort_order INTEGER DEFAULT 0
            )
        ''')
        # 子任务表
        cur.execute('''
            CREATE TABLE IF NOT EXISTS sub_tasks (
                id TEXT PRIMARY KEY,
                main_id TEXT NOT NULL,
                name TEXT NOT NULL,
                type TEXT DEFAULT 'sub',
                owner TEXT,
                description TEXT,
                start_date TEXT,
                end_date TEXT,
                actual_end TEXT,
                man_days REAL DEFAULT 0,
                progress INTEGER DEFAULT 0,
                calendar_days INTEGER DEFAULT 0,
                work_days INTEGER DEFAULT 0,
                sort_order INTEGER DEFAULT 0,
                FOREIGN KEY (main_id) REFERENCES main_projects(id) ON DELETE CASCADE
            )
        ''')
        # 事件表
        cur.execute('''
            CREATE TABLE IF NOT EXISTS events (
                id TEXT PRIMARY KEY,
                main_id TEXT NOT NULL,
                name TEXT NOT NULL,
                type TEXT NOT NULL,
                owner TEXT,
                date TEXT,
                description TEXT,
                FOREIGN KEY (main_id) REFERENCES main_projects(id) ON DELETE CASCADE
            )
        ''')
        cur.execute('CREATE INDEX IF NOT EXISTS idx_sub_main ON sub_tasks(main_id)')
        cur.execute('CREATE INDEX IF NOT EXISTS idx_event_main ON events(main_id)')

# ---------- 计算工具 ----------
def calculate_days(start_str, end_str):
    if not start_str or not end_str:
        return 0, 0
    try:
        d_start = datetime.strptime(start_str, "%Y-%m-%d").date()
        d_end = datetime.strptime(end_str, "%Y-%m-%d").date()
    except ValueError:
        return 0, 0
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

def calculate_auto_progress(start_str, end_str, actual_end_str, today_str):
    if not start_str or not end_str:
        return 0
    try:
        d_start = datetime.strptime(start_str, "%Y-%m-%d").date()
        d_end = datetime.strptime(end_str, "%Y-%m-%d").date()
        d_today = datetime.strptime(today_str, "%Y-%m-%d").date()
    except ValueError:
        return 0

    if actual_end_str:
        try:
            d_actual = datetime.strptime(actual_end_str, "%Y-%m-%d").date()
        except ValueError:
            return 0
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

# ---------- 内部重算 ----------
def _recalc_main_project(main_id, cur):
    cur.execute('''
        SELECT start_date, end_date, man_days FROM sub_tasks WHERE main_id = ?
    ''', (main_id,))
    rows = cur.fetchall()
    all_starts = [r['start_date'] for r in rows if r['start_date'] and validate_date(r['start_date'])]
    all_ends = [r['end_date'] for r in rows if r['end_date'] and validate_date(r['end_date'])]

    cur.execute("SELECT date FROM events WHERE main_id = ?", (main_id,))
    event_dates = [r['date'] for r in cur.fetchall() if r['date'] and validate_date(r['date'])]
    all_starts.extend(event_dates)
    all_ends.extend(event_dates)

    start_date = min(all_starts) if all_starts else None
    end_date = max(all_ends) if all_ends else None
    total_man_days = sum(r['man_days'] for r in rows if r['man_days'] and isinstance(r['man_days'], (int, float)))

    calendar_days = 0
    work_days = 0
    if start_date and end_date:
        calendar_days, work_days = calculate_days(start_date, end_date)

    cur.execute('''
        UPDATE main_projects 
        SET start_date = ?, end_date = ?, man_days = ?, calendar_days = ?, work_days = ?
        WHERE id = ?
    ''', (start_date, end_date, total_man_days, calendar_days, work_days, main_id))

def recalc_main_project(main_id):
    with db_cursor() as cur:
        _recalc_main_project(main_id, cur)

def recalc_all_main_projects():
    with db_cursor() as cur:
        cur.execute("SELECT id FROM main_projects")
        for row in cur.fetchall():
            _recalc_main_project(row['id'], cur)

# ---------- 数据迁移 ----------
def migrate_from_json(json_file="projects_data.json"):
    with db_cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM main_projects")
        if cur.fetchone()[0] > 0:
            return

        if not os.path.exists(json_file):
            default_data = [
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
            projects = default_data
        else:
            with open(json_file, 'r', encoding='utf-8') as f:
                projects = json.load(f)

        for main_order, main in enumerate(projects, start=1):
            cur.execute('''
                INSERT INTO main_projects (id, name, type, owner, description, sort_order)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', (main['id'], main['name'], main['type'], main.get('owner', ''), main.get('description', ''), main_order))

            for sub_order, child in enumerate(main.get('children', []), start=1):
                cur.execute('''
                    INSERT INTO sub_tasks 
                    (id, main_id, name, type, owner, description, start_date, end_date, actual_end, man_days, sort_order)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    child['id'], main['id'], child['name'], child.get('type', 'sub'),
                    child.get('owner', ''), child.get('description', ''),
                    child.get('start'), child.get('end'), child.get('actual_end'),
                    child.get('man_days', 0), sub_order
                ))

            for evt in main.get('events', []):
                cur.execute('''
                    INSERT INTO events (id, main_id, name, type, owner, date, description)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                ''', (
                    evt['id'], main['id'], evt['name'], evt['type'],
                    evt.get('owner', ''), evt.get('date'), evt.get('description', '')
                ))

        recalc_all_main_projects()

# ---------- API 函数 ----------
def get_all_projects(today="2026-08-12"):
    with db_cursor() as cur:
        cur.execute("SELECT * FROM main_projects ORDER BY sort_order")
        main_rows = cur.fetchall()
        projects = []
        for main in main_rows:
            main_dict = dict(main)
            cur.execute("SELECT * FROM sub_tasks WHERE main_id = ? ORDER BY sort_order", (main['id'],))
            children = [dict(row) for row in cur.fetchall()]
            for child in children:
                c_days, w_days = calculate_days(child.get('start_date'), child.get('end_date'))
                child['calendar_days'] = c_days
                child['work_days'] = w_days
                child['progress'] = calculate_auto_progress(
                    child.get('start_date'), child.get('end_date'),
                    child.get('actual_end'), today
                )
                child['start'] = child.get('start_date')
                child['end'] = child.get('end_date')
                child['actual_end'] = child.get('actual_end')
                child.setdefault('description', '')
                child.setdefault('owner', '')
                child.setdefault('man_days', 0)
            main_dict['children'] = children

            cur.execute("SELECT * FROM events WHERE main_id = ?", (main['id'],))
            events = [dict(row) for row in cur.fetchall()]
            for evt in events:
                evt['date'] = evt.get('date')
                evt.setdefault('description', '')
                evt.setdefault('owner', '')
            main_dict['events'] = events

            main_dict['start'] = main_dict.get('start_date')
            main_dict['end'] = main_dict.get('end_date')
            main_dict['man_days'] = main_dict.get('man_days', 0)
            main_dict['calendar_days'] = main_dict.get('calendar_days', 0)
            main_dict['work_days'] = main_dict.get('work_days', 0)
            main_dict['owner'] = main_dict.get('owner', '')
            main_dict['description'] = main_dict.get('description', '')

            projects.append(main_dict)
        return projects

def add_node(main_id, node_data):
    node_type = node_data.get('type', 'sub')
    with db_cursor() as cur:
        # 检查主项目是否存在
        cur.execute("SELECT id FROM main_projects WHERE id = ?", (main_id,))
        if not cur.fetchone():
            return False

        if node_type in ('meeting', 'milestone'):
            new_id = generate_id('EVT')
            cur.execute('''
                INSERT INTO events (id, main_id, name, type, owner, date, description)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', (
                new_id, main_id, node_data['name'], node_type,
                node_data.get('owner', ''), node_data.get('start'), node_data.get('description', '')
            ))
        else:
            new_id = generate_id('SUB')
            cur.execute("SELECT MAX(sort_order) FROM sub_tasks WHERE main_id = ?", (main_id,))
            max_order = cur.fetchone()[0] or 0
            sort_order = node_data.get('sort_order')
            if sort_order is None:
                sort_order = max_order + 1
            else:
                # 将后续序号顺延
                cur.execute("UPDATE sub_tasks SET sort_order = sort_order + 1 WHERE main_id = ? AND sort_order >= ?",
                            (main_id, sort_order))
            cur.execute('''
                INSERT INTO sub_tasks 
                (id, main_id, name, type, owner, description, start_date, end_date, actual_end, man_days, sort_order)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                new_id, main_id, node_data['name'], 'sub',
                node_data.get('owner', ''), node_data.get('description', ''),
                node_data.get('start'), node_data.get('end'), node_data.get('actual_end'),
                float(node_data.get('man_days', 1)), sort_order
            ))
        _recalc_main_project(main_id, cur)
    return True

def add_project(project_data):
    new_id = generate_id('MAIN')
    with db_cursor() as cur:
        cur.execute("SELECT MAX(sort_order) FROM main_projects")
        max_order = cur.fetchone()[0] or 0
        sort_order = project_data.get('sort_order')
        if sort_order is None:
            sort_order = max_order + 1
        else:
            cur.execute("UPDATE main_projects SET sort_order = sort_order + 1 WHERE sort_order >= ?", (sort_order,))
        cur.execute('''
            INSERT INTO main_projects (id, name, type, owner, description, sort_order)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (new_id, project_data['name'], 'main',
              project_data.get('owner', ''), project_data.get('description', ''), sort_order))
        _recalc_main_project(new_id, cur)
    return new_id

def update_node(node_id, updates):
    with db_cursor() as cur:
        # 检查主项目
        cur.execute("SELECT * FROM main_projects WHERE id = ?", (node_id,))
        if cur.fetchone():
            # 只更新提供的字段
            fields = []
            values = []
            for key in ['name', 'owner', 'description']:
                if updates.get(key) is not None:
                    fields.append(f"{key} = ?")
                    values.append(updates[key])
            if fields:
                cur.execute(f"UPDATE main_projects SET {', '.join(fields)} WHERE id = ?", values + [node_id])
            return True

        # 子任务
        cur.execute("SELECT main_id FROM sub_tasks WHERE id = ?", (node_id,))
        row = cur.fetchone()
        if row:
            main_id = row['main_id']
            fields = []
            values = []
            # 可更新字段
            for key in ['name', 'owner', 'description', 'start', 'end', 'actual_end', 'man_days']:
                if updates.get(key) is not None:
                    # 数据库列名映射
                    col_map = {
                        'start': 'start_date',
                        'end': 'end_date',
                        'actual_end': 'actual_end',
                        'man_days': 'man_days',
                        'name': 'name',
                        'owner': 'owner',
                        'description': 'description'
                    }
                    db_col = col_map.get(key)
                    if db_col:
                        fields.append(f"{db_col} = ?")
                        # 处理类型
                        val = updates[key]
                        if key == 'man_days' and val is not None:
                            try:
                                val = float(val)
                            except (TypeError, ValueError):
                                val = 0
                        elif key in ['start', 'end', 'actual_end'] and not val:
                            val = None
                        values.append(val)
            if fields:
                cur.execute(f"UPDATE sub_tasks SET {', '.join(fields)} WHERE id = ?", values + [node_id])
                _recalc_main_project(main_id, cur)
            return True

        # 事件
        cur.execute("SELECT main_id FROM events WHERE id = ?", (node_id,))
        row = cur.fetchone()
        if row:
            main_id = row['main_id']
            fields = []
            values = []
            for key in ['name', 'owner', 'description', 'date']:
                if updates.get(key) is not None:
                    col_map = {
                        'name': 'name',
                        'owner': 'owner',
                        'description': 'description',
                        'date': 'date'
                    }
                    db_col = col_map.get(key)
                    if db_col:
                        fields.append(f"{db_col} = ?")
                        values.append(updates[key])
            if fields:
                cur.execute(f"UPDATE events SET {', '.join(fields)} WHERE id = ?", values + [node_id])
                _recalc_main_project(main_id, cur)
            return True

        return False

def delete_node(node_id):
    with db_cursor() as cur:
        # 主项目
        cur.execute("SELECT id FROM main_projects WHERE id = ?", (node_id,))
        if cur.fetchone():
            cur.execute("DELETE FROM main_projects WHERE id = ?", (node_id,))
            return True

        # 子任务
        cur.execute("SELECT main_id FROM sub_tasks WHERE id = ?", (node_id,))
        row = cur.fetchone()
        if row:
            main_id = row['main_id']
            cur.execute("DELETE FROM sub_tasks WHERE id = ?", (node_id,))
            _recalc_main_project(main_id, cur)
            return True

        # 事件
        cur.execute("SELECT main_id FROM events WHERE id = ?", (node_id,))
        row = cur.fetchone()
        if row:
            main_id = row['main_id']
            cur.execute("DELETE FROM events WHERE id = ?", (node_id,))
            _recalc_main_project(main_id, cur)
            return True

        return False

def delete_project(project_id):
    with db_cursor() as cur:
        cur.execute("DELETE FROM main_projects WHERE id = ?", (project_id,))
        return cur.rowcount > 0

# ---------- 初始化 ----------
init_db()
migrate_from_json()
