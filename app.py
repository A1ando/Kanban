import os
from flask import Flask, render_template, request, jsonify
from datetime import datetime
import data

template_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), 'templates'))
app = Flask(__name__, template_folder=template_dir)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/projects', methods=['GET'])
def get_projects():
    today = datetime.today().strftime('%Y-%m-%d')
    projects = data.get_all_projects(today)
    return jsonify({
        "projects": projects,
        "timeline_start": "2026-06-01",
        "timeline_end": "2026-12-31",
        "today": today
    })

@app.route('/api/nodes', methods=['POST'])
def add_node():
    req = request.json
    main_id = req.get('main_project_id')
    success = data.add_node(main_id, req)
    if not success:
        return jsonify({"success": False, "error": "主项目未找到"}), 404
    return jsonify({"success": True})

@app.route('/api/nodes', methods=['PUT'])
def update_node():
    req = request.json
    node_id = req.get('id')
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
    success = data.update_node(node_id, updates)
    if not success:
        return jsonify({"success": False, "error": "节点未找到"}), 404
    return jsonify({"success": True})

@app.route('/api/nodes/<node_id>', methods=['DELETE'])
def delete_node(node_id):
    success = data.delete_node(node_id)
    if not success:
        return jsonify({"success": False, "error": "节点未找到"}), 404
    return jsonify({"success": True})

@app.route('/api/projects', methods=['POST'])
def add_project():
    req = request.json
    if not req.get('name'):
        return jsonify({"success": False, "error": "项目名称不能为空"}), 400
    new_id = data.add_project(req)
    return jsonify({"success": True, "id": new_id})

@app.route('/api/projects/<project_id>', methods=['DELETE'])
def delete_project(project_id):
    success = data.delete_project(project_id)
    if not success:
        return jsonify({"success": False, "error": "项目未找到"}), 404
    return jsonify({"success": True})

if __name__ == '__main__':
    app.run(debug=True, port=5000)