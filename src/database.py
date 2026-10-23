import pymssql

def get_connection_Study():
    """获取数据库连接"""
    return pymssql.connect(
        host="localhost:1400",
        user="SELECTUser",
        password="onlySELECT@123",
        database="Study",
        charset='utf8'
    )

def get_connection_Teach():
    """获取数据库连接"""
    return pymssql.connect(
        host="localhost:1400",
        user="SELECTUser",
        password="onlySELECT@123",
        database="Teach",
        charset='utf8'
    )