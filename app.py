import flask
import src.database
import json
import traceback
import requests
import os

app = flask.Flask(__name__)

@app.route('/')
def index():
    return flask.render_template('index.html')

# 新页面路由
@app.route('/visual-sql')
def visual_sql():
    return flask.render_template('visual-sql.html')
@app.route('/text')
def text():
    return flask.render_template('text.html')

@app.route('/relationship-diagram')
def relationship_diagram():
    return flask.render_template('relationship-diagram.html')

# 挑战页面路由
@app.route('/basic-challenge')
def basic_challenge():
    return flask.render_template('basic-challenge.html')

@app.route('/advanced-challenge')
def advanced_challenge():
    return flask.render_template('advanced-challenge.html')

@app.route('/expert-challenge')
def expert_challenge():
    return flask.render_template('expert-challenge.html')

# 为了向后兼容，保留这些路由，但都重定向到主页
@app.route('/learn')
def learn():
    return flask.redirect('/#learn')

@app.route('/challenge')
def challenge():
    return flask.redirect('/#challenge')

# SQL执行API端点
@app.route('/api/execute-sql', methods=['POST'])
def execute_sql():
    try:
        data = flask.request.get_json()
        sql_query = data.get('sql')
        database = data.get('database', 'study')
        
        if not sql_query:
            return flask.jsonify({'error': 'SQL查询不能为空'}), 400
        
        # 根据数据库选择连接
        if database == 'study':
            conn = src.database.get_connection_Study()
        elif database == 'teach':
            conn = src.database.get_connection_Teach()
        else:
            return flask.jsonify({'error': '无效的数据库选择'}), 400
        
        cursor = conn.cursor()
        cursor.execute(sql_query)
        
        # 获取列名
        columns = [desc[0] for desc in cursor.description] if cursor.description else []
        
        # 获取数据
        rows = cursor.fetchall()
        
        # 转换数据为可序列化的格式
        results = []
        for row in rows:
            row_data = []
            for value in row:
                if value is None:
                    row_data.append(None)
                elif isinstance(value, (int, float, str)):
                    row_data.append(value)
                else:
                    row_data.append(str(value))
            results.append(row_data)
        
        cursor.close()
        conn.close()
        
        return flask.jsonify({
            'success': True,
            'columns': columns,
            'data': results,
            'row_count': len(results)
        })
        
    except Exception as e:
        error_msg = str(e)
        print(f"SQL执行错误: {error_msg}")
        print(f"错误详情: {traceback.format_exc()}")
        return flask.jsonify({
            'success': False,
            'error': error_msg
        }), 500

# SQL答案比较API端点
@app.route('/api/compare-sql', methods=['POST'])
def compare_sql():
    try:
        data = flask.request.get_json()
        user_sql = data.get('user_sql')
        correct_sql = data.get('correct_sql')
        database = data.get('database', 'study')
        
        if not user_sql or not correct_sql:
            return flask.jsonify({'error': '用户SQL和正确答案SQL都不能为空'}), 400
        
        # 根据数据库选择连接
        if database == 'study':
            conn = src.database.get_connection_Study()
        elif database == 'teach':
            conn = src.database.get_connection_Teach()
        else:
            return flask.jsonify({'error': '无效的数据库选择'}), 400
        
        cursor = conn.cursor()
        
        # 执行用户SQL
        try:
            cursor.execute(user_sql)
            user_columns = [desc[0] for desc in cursor.description] if cursor.description else []
            user_rows = cursor.fetchall()
            user_results = []
            for row in user_rows:
                row_data = []
                for value in row:
                    if value is None:
                        row_data.append(None)
                    elif isinstance(value, (int, float, str)):
                        row_data.append(value)
                    else:
                        row_data.append(str(value))
                user_results.append(row_data)
        except Exception as e:
            return flask.jsonify({
                'success': False,
                'is_correct': False,
                'error': f'用户SQL执行错误: {str(e)}'
            })
        
        # 执行正确答案SQL
        try:
            cursor.execute(correct_sql)
            correct_columns = [desc[0] for desc in cursor.description] if cursor.description else []
            correct_rows = cursor.fetchall()
            correct_results = []
            for row in correct_rows:
                row_data = []
                for value in row:
                    if value is None:
                        row_data.append(None)
                    elif isinstance(value, (int, float, str)):
                        row_data.append(value)
                    else:
                        row_data.append(str(value))
                correct_results.append(row_data)
        except Exception as e:
            return flask.jsonify({
                'success': False,
                'is_correct': False,
                'error': f'正确答案SQL执行错误: {str(e)}'
            })
        
        cursor.close()
        conn.close()
        
        # 比较结果
        is_correct = (user_columns == correct_columns and user_results == correct_results)
        
        return flask.jsonify({
            'success': True,
            'is_correct': is_correct,
            'user_result': {
                'columns': user_columns,
                'data': user_results,
                'row_count': len(user_results)
            },
            'correct_result': {
                'columns': correct_columns,
                'data': correct_results,
                'row_count': len(correct_results)
            }
        })
        
    except Exception as e:
        error_msg = str(e)
        print(f"SQL比较错误: {error_msg}")
        print(f"错误详情: {traceback.format_exc()}")
        return flask.jsonify({
            'success': False,
            'is_correct': False,
            'error': error_msg
        }), 500



if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=4000)