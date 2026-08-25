import os
import logging
from flask import Flask, render_template, request, jsonify
from datetime import datetime
import data

template_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), 'templates'))
app = Flask(__name__, template_folder=template_dir)

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/projects', methods=['GET'])
def get_projects():
    try:
        today = datetime.today().strftime('%Y-%m-%d')
        result = data.get_all_projects(today)
        return jsonify(result)
    except Exception as e:
        logger.error(f"获取项目失败: {e}")
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/nodes', methods=['POST'])
def add_node():
    try:
        req = request.json
        if not req or not req.get('main_project_id') or not req.get('name'):
            return jsonify({"success": False, "error": "缺少必要参数"}), 400
        
        main_id = req.get('main_project_id')
        success = data.add_node(main_id, req)
        if not success:
            return jsonify({"success": False, "error": "主项目未找到"}), 404
        return jsonify({"success": True})
    except Exception as e:
        logger.error(f"添加节点失败: {e}")
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/nodes', methods=['PUT'])
def update_node():
    try:
        req = request.json
        if not req or not req.get('id'):
            return jsonify({"success": False, "error": "缺少节点ID"}), 400

        node_id = req.get('id')
        # 只提取需要更新的字段，避免传递额外字段
        updates = {
            "name": req.get("name"),
            "owner": req.get("owner"),
            "description": req.get("description"),
            "start": req.get("start"),
            "end": req.get("end"),
            "actual_end": req.get("actual_end") if req.get("actual_end") else None,
            "man_days": req.get("man_days"),
            "date": req.get("date")
        }
        # 过滤掉None值，只更新传入的字段（但前端会传全部，保留）
        success = data.update_node(node_id, updates)
        if not success:
            return jsonify({"success": False, "error": "节点未找到"}), 404
        return jsonify({"success": True})
    except Exception as e:
        logger.error(f"更新节点失败: {e}")
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/nodes/<node_id>', methods=['DELETE'])
def delete_node(node_id):
    try:
        success = data.delete_node(node_id)
        if not success:
            return jsonify({"success": False, "error": "节点未找到"}), 404
        return jsonify({"success": True})
    except Exception as e:
        logger.error(f"删除节点失败: {e}")
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/projects', methods=['POST'])
def add_project():
    try:
        req = request.json
        if not req or not req.get('name'):
            return jsonify({"success": False, "error": "项目名称不能为空"}), 400
        new_id = data.add_project(req)
        return jsonify({"success": True, "id": new_id})
    except Exception as e:
        logger.error(f"添加项目失败: {e}")
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/projects/<project_id>', methods=['DELETE'])
def delete_project(project_id):
    try:
        success = data.delete_project(project_id)
        if not success:
            return jsonify({"success": False, "error": "项目未找到"}), 404
        return jsonify({"success": True})
    except Exception as e:
        logger.error(f"删除项目失败: {e}")
        return jsonify({"success": False, "error": str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0',debug=False, port=5000, threaded=True)  # 生产模式建议debug=False
